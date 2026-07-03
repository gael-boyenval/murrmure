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
  can_apply_space: boolean;
  can_mint_grants: boolean;
  can_register_triggers: boolean;
}

export interface DoctorExecutorReachability {
  name: string;
  type: string;
  reachable: boolean | null;
  detail?: string;
  last_poll_at?: string | null;
}

export interface DoctorSpaceProfile {
  space_id: string;
  scopes: string[];
  capabilities: SpaceCapabilities;
  executors?: DoctorExecutorReachability[];
}

export interface DoctorProfile {
  auth_source: AuthSource | null;
  hub_url?: string;
  hub_reachable: boolean;
  token_valid: boolean;
  bootstrap_token: boolean;
  whoami?: WhoamiResponse;
  spaces: DoctorSpaceProfile[];
}

export interface DoctorResult {
  ok: boolean;
  issues: DoctorIssue[];
  profile: DoctorProfile;
}

function summarizeCapabilities(scopes: string[]): SpaceCapabilities {
  return {
    can_apply_space: hasScope(scopes, "space:write"),
    can_mint_grants: hasScope(scopes, "space:admin"),
    can_register_triggers: hasScope(scopes, "trigger:register"),
  };
}

async function fetchExecutorPollStatus(
  hubUrl: string,
  token: string,
): Promise<Map<string, { last_poll_at: string | null; reachable: boolean }>> {
  try {
    const res = await fetch(`${hubUrl}/v1/executor/poll-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return new Map();
    const body = (await res.json()) as {
      executors?: Array<{ executor_id: string; last_poll_at: string | null; reachable: boolean }>;
    };
    return new Map(
      (body.executors ?? []).map((row) => [
        row.executor_id,
        { last_poll_at: row.last_poll_at, reachable: row.reachable },
      ]),
    );
  } catch {
    return new Map();
  }
}

async function fetchExecutorReachability(
  hubUrl: string,
  token: string,
  spaceId: string,
): Promise<DoctorExecutorReachability[]> {
  try {
    const [executorsRes, pollStatus] = await Promise.all([
      fetch(`${hubUrl}/v1/spaces/${spaceId}/executors`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetchExecutorPollStatus(hubUrl, token),
    ]);
    if (!executorsRes.ok) return [];
    const body = (await executorsRes.json()) as { executors?: Array<Record<string, unknown>> };
    return (body.executors ?? []).map((row) => {
      const binding = (row.binding ?? row) as { type?: string; executor_id?: string };
      const type = String(binding.type ?? "unknown");
      const executorId = String(binding.executor_id ?? row.name ?? "");
      let reachable: boolean | null = null;
      let detail: string | undefined;
      let last_poll_at: string | null | undefined;
      if (type === "shell_spawn") {
        detail = "requires linked space root path";
      } else if (type === "mcp_session") {
        detail = "requires connected MCP session (invoke preflight)";
      } else if (type === "queue_poll") {
        const poll = pollStatus.get(executorId);
        last_poll_at = poll?.last_poll_at ?? null;
        reachable = poll?.reachable ?? false;
        detail = last_poll_at
          ? `last poll ${last_poll_at}${reachable ? " (reachable)" : " (stale)"}`
          : "no worker poll yet";
      } else {
        detail = "reachability varies by executor type";
      }
      return { name: String(row.name ?? ""), type, reachable, detail, last_poll_at };
    });
  } catch {
    return [];
  }
}

function capabilityLine(capabilities: SpaceCapabilities): string {
  const parts = [
    `apply space ${capabilities.can_apply_space ? "✓" : "✗"}`,
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
      if (entry.executors?.length) {
        for (const ex of entry.executors) {
          lines.push(`    executor ${ex.name} (${ex.type}) — ${ex.detail ?? "—"}`);
        }
      }
    }
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
        if (!bootstrapToken && !hasScope(scopes, "space:write")) {
          issues.push({
            code: "SCOPE_MISSING",
            message: "Missing space:write scope (cannot apply murrmure/)",
          });
        }
        spaces.push({
          space_id: "(token)",
          scopes,
          capabilities: summarizeCapabilities(scopes),
        });
      } else {
        for (const entry of whoami.spaces) {
          const executors =
            hasScope(entry.scopes, "space:read") || bootstrapToken
              ? await fetchExecutorReachability(auth.hubUrl, auth.token, entry.space_id)
              : undefined;
          spaces.push({
            space_id: entry.space_id,
            scopes: entry.scopes,
            capabilities: summarizeCapabilities(entry.scopes),
            executors,
          });
          if (!bootstrapToken && !hasScope(entry.scopes, "space:write")) {
            issues.push({
              code: "SCOPE_MISSING",
              message: `Missing space:write on ${entry.space_id} (cannot apply murrmure/)`,
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({ code: "AUTH_CHECK_FAILED", message: String(error) });
  }

  const profile: DoctorProfile = {
    auth_source: authSource,
    hub_url: auth.hubUrl,
    hub_reachable: hubReachable,
    token_valid: tokenValid,
    bootstrap_token: bootstrapToken,
    whoami,
    spaces,
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
