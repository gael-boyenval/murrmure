import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HubAuth } from "../auth.js";
import { resolveHubAuth } from "../auth.js";
import { buildAuthContext, fetchWhoami, type WhoamiResponse } from "./auth-context.js";
import { resolveAuthSource, type AuthSource } from "./auth-source.js";
import { hasScope } from "./scope.js";

export interface DoctorIssue {
  code: string;
  message: string;
}

export interface SpaceCapabilities {
  can_push_flows: boolean;
  can_mint_grants: boolean;
  can_register_triggers: boolean;
}

export interface DoctorSpaceProfile {
  space_id: string;
  scopes: string[];
  capabilities: SpaceCapabilities;
}

export interface DoctorDevKitProfile {
  cli_version: string;
  dev_kit_version?: string;
  match: boolean;
  cwd?: string;
}

export interface DoctorProfile {
  auth_source: AuthSource | null;
  hub_url?: string;
  hub_reachable: boolean;
  token_valid: boolean;
  bootstrap_token: boolean;
  whoami?: WhoamiResponse;
  spaces: DoctorSpaceProfile[];
  dev_kit?: DoctorDevKitProfile;
}

export interface DoctorResult {
  ok: boolean;
  issues: DoctorIssue[];
  profile: DoctorProfile;
}

function readCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "..", "VERSION"),
    join(here, "..", "VERSION"),
    join(here, "..", "..", "package.json"),
  ];
  for (const path of candidates) {
    try {
      if (path.endsWith(".json")) {
        const pkg = JSON.parse(readFileSync(path, "utf-8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } else {
        return readFileSync(path, "utf-8").trim();
      }
    } catch {
      /* try next */
    }
  }
  return "0.0.0";
}

function readDependencyVersion(
  pkg: { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> },
  dependency: string,
): string | undefined {
  const value = pkg.dependencies?.[dependency] ?? pkg.devDependencies?.[dependency];
  return typeof value === "string" ? value : undefined;
}

function summarizeCapabilities(scopes: string[]): SpaceCapabilities {
  return {
    can_push_flows: hasScope(scopes, "flow:install"),
    can_mint_grants: hasScope(scopes, "space:admin"),
    can_register_triggers: hasScope(scopes, "trigger:register"),
  };
}

function checkDevKitSkew(cwd: string, cliVersion: string): DoctorDevKitProfile | undefined {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    const devKitVersion = readDependencyVersion(packageJson, "@murrmure/flow-dev-kit");
    if (!devKitVersion) return undefined;

    return {
      cli_version: cliVersion,
      dev_kit_version: devKitVersion,
      match: devKitVersion === cliVersion,
      cwd,
    };
  } catch {
    return undefined;
  }
}

function capabilityLine(capabilities: SpaceCapabilities): string {
  const parts = [
    `push flows ${capabilities.can_push_flows ? "✓" : "✗"}`,
    `mint grants ${capabilities.can_mint_grants ? "✓" : "✗"}`,
    `register triggers ${capabilities.can_register_triggers ? "✓" : "✗"}`,
  ];
  return parts.join(" · ");
}

export function formatDoctorHuman(result: DoctorResult): string {
  const { profile, issues } = result;
  const lines: string[] = [];

  if (profile.auth_source) {
    lines.push(`Auth source: ${profile.auth_source}`);
  }
  if (profile.hub_url) {
    lines.push(
      `Hub: ${profile.hub_url} (${profile.hub_reachable ? "reachable" : "unreachable"})`,
    );
  }
  lines.push(`Token: ${profile.token_valid ? "valid" : "invalid"}`);

  if (profile.whoami) {
    const expires = profile.whoami.expires_at ?? "—";
    lines.push(
      `Actor: ${profile.whoami.actor_id} · token ${profile.whoami.token_id} · kind ${profile.whoami.kind} · expires ${expires}`,
    );
  }

  if (profile.bootstrap_token) {
    lines.push("(bootstrap token — hub bypasses scope name checks)");
  }

  lines.push("", "Profile");

  if (profile.spaces.length === 0) {
    lines.push("  (no spaces — bootstrap token on empty hub, or token not bound to a space yet)");
  } else {
    const spaceWidth = Math.max(5, ...profile.spaces.map((entry) => entry.space_id.length));
    lines.push(
      `  ${"SPACE".padEnd(spaceWidth)}  SCOPES`.padEnd(spaceWidth + 2) + "  CAPABILITIES",
    );
    for (const entry of profile.spaces) {
      const scopes = entry.scopes.length > 0 ? entry.scopes.join(", ") : "(none)";
      lines.push(
        `  ${entry.space_id.padEnd(spaceWidth)}  ${scopes}`.padEnd(spaceWidth + 2 + scopes.length) +
          `  ${capabilityLine(entry.capabilities)}`,
      );
    }
  }

  if (profile.dev_kit) {
    const { cli_version, dev_kit_version, match } = profile.dev_kit;
    lines.push(
      "",
      `Dev kit: @murrmure/cli ${cli_version} · flow-dev-kit ${dev_kit_version ?? "—"} (${match ? "match" : "skew"})`,
    );
  }

  if (issues.length > 0) {
    lines.push("", "Issues");
    for (const issue of issues) {
      lines.push(`  ✗ ${issue.code}: ${issue.message}`);
    }
  } else if (result.ok) {
    lines.push("", "✓ All checks passed");
  }

  return lines.join("\n");
}

export async function runDoctor(options?: {
  hubUrl?: string;
  token?: string;
  cwd?: string;
}): Promise<DoctorResult> {
  const issues: DoctorIssue[] = [];
  const authSource = resolveAuthSource({
    hubUrl: options?.hubUrl,
    token: options?.token,
  });
  const auth = resolveHubAuth({ hubUrl: options?.hubUrl, token: options?.token });

  if ("error" in auth) {
    return {
      ok: false,
      issues: [{ code: "AUTH_MISSING", message: auth.error }],
      profile: {
        auth_source: authSource,
        hub_reachable: false,
        token_valid: false,
        bootstrap_token: false,
        spaces: [],
      },
    };
  }

  let hubReachable = false;
  try {
    const health = await fetch(`${auth.hubUrl}/v1/health`);
    hubReachable = health.ok;
    if (!health.ok) {
      issues.push({ code: "HUB_UNREACHABLE", message: `Hub health returned ${health.status}` });
    }
  } catch (error) {
    issues.push({ code: "HUB_UNREACHABLE", message: String(error) });
  }

  let whoami: WhoamiResponse | undefined;
  let tokenValid = false;
  let bootstrapToken = false;
  const spaces: DoctorSpaceProfile[] = [];

  try {
    const whoamiResult = await fetchWhoami(auth);
    if ("error" in whoamiResult) {
      issues.push({ code: "TOKEN_DENIED", message: "Token rejected by hub" });
    } else {
      whoami = whoamiResult;
      tokenValid = true;
      const ctx = buildAuthContext(whoami);
      bootstrapToken = ctx.tokenSpaceId === "bootstrap";

      if (whoami.spaces.length === 0) {
        const scopes = ctx.tokenScopes;
        if (!bootstrapToken && !hasScope(scopes, "flow:install")) {
          issues.push({
            code: "SCOPE_MISSING",
            message: "Missing flow:install scope (cannot push flows)",
          });
        }
        spaces.push({
          space_id: "(token)",
          scopes,
          capabilities: summarizeCapabilities(scopes),
        });
      } else {
        for (const entry of whoami.spaces) {
          spaces.push({
            space_id: entry.space_id,
            scopes: entry.scopes,
            capabilities: summarizeCapabilities(entry.scopes),
          });
          if (!bootstrapToken && !hasScope(entry.scopes, "flow:install")) {
            issues.push({
              code: "SCOPE_MISSING",
              message: `Missing flow:install on ${entry.space_id} (cannot push flows)`,
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({ code: "AUTH_CHECK_FAILED", message: String(error) });
  }

  const cliVersion = readCliVersion();
  const devKit = checkDevKitSkew(options?.cwd ?? process.cwd(), cliVersion);
  if (devKit && !devKit.match) {
    issues.push({
      code: "DEVKIT_CLI_VERSION_MISMATCH",
      message: `@murrmure/cli (${devKit.cli_version}) and @murrmure/flow-dev-kit (${devKit.dev_kit_version}) must use matching versions`,
    });
  }

  const profile: DoctorProfile = {
    auth_source: authSource,
    hub_url: auth.hubUrl,
    hub_reachable: hubReachable,
    token_valid: tokenValid,
    bootstrap_token: bootstrapToken,
    whoami,
    spaces,
    ...(devKit ? { dev_kit: devKit } : {}),
  };

  return {
    ok: issues.length === 0,
    issues,
    profile,
  };
}

export async function runDoctorForAuth(auth: HubAuth, cwd?: string): Promise<DoctorResult> {
  return runDoctor({ hubUrl: auth.hubUrl, token: auth.token, cwd });
}
