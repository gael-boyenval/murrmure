import type { HubAuth } from "../auth.js";
import { resolveHubAuth } from "../auth.js";
import { buildAuthContext, fetchWhoami, type WhoamiResponse } from "./auth-context.js";
import { resolveAuthSource, type AuthSource } from "./auth-source.js";
import { probeMcpLiveHealth, scanMcpConfig } from "./space-doctor-mcp.js";
import { discoverMurrmureProject } from "./space-doctor.js";
import { hasScope } from "./scope.js";

export interface DoctorIssue {
  code: string;
  message: string;
  severity?: "error" | "warning" | "info";
  fix?: string;
  paths?: string[];
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
  slug?: string;
  name?: string;
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

async function fetchSpaceLabels(
  hubUrl: string,
  token: string,
): Promise<Map<string, { slug?: string; name?: string }>> {
  try {
    const res = await fetch(`${hubUrl}/v1/spaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return new Map();
    const body = (await res.json()) as {
      spaces?: Array<{ space_id: string; slug?: string; name?: string }>;
    };
    return new Map(
      (body.spaces ?? []).map((space) => [
        space.space_id,
        { slug: space.slug, name: space.name },
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
        detail = "needs linked space root";
      } else if (type === "mcp_session") {
        detail = "needs connected MCP session";
      } else if (type === "queue_poll") {
        const poll = pollStatus.get(executorId);
        last_poll_at = poll?.last_poll_at ?? null;
        reachable = poll?.reachable ?? false;
        detail = last_poll_at
          ? `last poll ${last_poll_at}${reachable ? "" : " · stale"}`
          : "no worker poll yet";
      } else {
        detail = undefined;
      }
      return { name: String(row.name ?? ""), type, reachable, detail, last_poll_at };
    });
  } catch {
    return [];
  }
}

function capabilityLine(capabilities: SpaceCapabilities): string {
  const parts = [
    capabilities.can_mint_grants ? "admin" : null,
    capabilities.can_apply_space ? "apply" : null,
    capabilities.can_register_triggers ? "triggers" : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : "limited";
}

function shortenHomePath(path: string): string {
  const home = process.env.HOME?.trim();
  if (home && path.startsWith(`${home}/`)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function issueSeverity(issue: DoctorIssue): "error" | "warning" | "info" {
  return issue.severity ?? "error";
}

/** Merge duplicate codes (e.g. user + project mcp.json) into one human row. */
export function coalesceDoctorIssues(issues: DoctorIssue[]): DoctorIssue[] {
  const order: string[] = [];
  const byCode = new Map<string, DoctorIssue>();
  for (const issue of issues) {
    const existing = byCode.get(issue.code);
    if (!existing) {
      byCode.set(issue.code, {
        ...issue,
        paths: issue.paths ? [...issue.paths] : undefined,
      });
      order.push(issue.code);
      continue;
    }
    const paths = new Set([...(existing.paths ?? []), ...(issue.paths ?? [])]);
    if (paths.size > 0) {
      existing.paths = [...paths];
    }
    if (issueSeverity(issue) === "error") {
      existing.severity = "error";
    }
    if (!existing.fix && issue.fix) {
      existing.fix = issue.fix;
    }
  }
  return order.map((code) => byCode.get(code)!);
}

export function formatDoctorHuman(result: DoctorResult): string {
  const { profile } = result;
  const issues = coalesceDoctorIssues(result.issues);
  const lines: string[] = [];

  if (profile.hub_url) {
    lines.push(
      `Hub     ${profile.hub_url}  ${profile.hub_reachable ? "✓" : "✗ unreachable"}`,
    );
  }
  const authBits = [
    profile.auth_source ?? "none",
    profile.token_valid ? "token ok" : "token invalid",
    profile.bootstrap_token ? "bootstrap" : null,
  ].filter((bit): bit is string => Boolean(bit));
  lines.push(`Auth    ${authBits.join(" · ")}`);
  if (profile.whoami) {
    lines.push(`Actor   ${profile.whoami.actor_id} (${profile.whoami.kind})`);
  }

  lines.push("");
  if (profile.spaces.length === 0) {
    lines.push("Spaces  (none)");
  } else {
    lines.push(`Spaces  (${profile.spaces.length})`);
    for (const entry of profile.spaces) {
      const label = entry.slug ?? entry.name;
      lines.push(label ? `  ${label}  (${entry.space_id})` : `  ${entry.space_id}`);
      lines.push(`    ${capabilityLine(entry.capabilities)}`);
      if (entry.executors?.length) {
        for (const ex of entry.executors) {
          const mark =
            ex.reachable === true ? "✓" : ex.reachable === false ? "✗" : "·";
          const detail = ex.detail ? ` — ${ex.detail}` : "";
          lines.push(`    ${mark} ${ex.name}${detail}`);
        }
      }
    }
  }

  const blocking = issues.filter((issue) => issueSeverity(issue) === "error");
  const notes = issues.filter((issue) => issueSeverity(issue) === "warning");

  if (blocking.length > 0) {
    lines.push("", "Issues");
    for (const issue of blocking) {
      lines.push(`  ✗ ${issue.message}`);
      for (const path of issue.paths ?? []) {
        lines.push(`      ${shortenHomePath(path)}`);
      }
      if (issue.fix) {
        lines.push(`      → ${issue.fix}`);
      }
    }
  }

  if (notes.length > 0) {
    lines.push("", "Notes");
    for (const issue of notes) {
      lines.push(`  · ${issue.message}`);
      for (const path of issue.paths ?? []) {
        lines.push(`      ${shortenHomePath(path)}`);
      }
      if (issue.fix) {
        lines.push(`      → ${issue.fix}`);
      }
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
  const discovered = discoverMurrmureProject(options?.cwd ?? process.cwd());

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
          // Local-tools connections are intentionally least-privilege.
          issues.push({
            code: "SCOPE_MISSING",
            severity: authSource === "active-connection" ? "warning" : "error",
            message: "Missing space:write scope (cannot apply murrmure/)",
            fix:
              authSource === "active-connection"
                ? "Local tools connections are read/run only — run mrmr login for operator apply"
                : undefined,
          });
        }
        spaces.push({
          space_id: "(token)",
          scopes,
          capabilities: summarizeCapabilities(scopes),
        });
      } else {
        const labels = await fetchSpaceLabels(auth.hubUrl, auth.token);
        for (const entry of whoami.spaces) {
          const executors =
            hasScope(entry.scopes, "space:read") || bootstrapToken
              ? await fetchExecutorReachability(auth.hubUrl, auth.token, entry.space_id)
              : undefined;
          const label = labels.get(entry.space_id);
          spaces.push({
            space_id: entry.space_id,
            slug: label?.slug,
            name: label?.name,
            scopes: entry.scopes,
            capabilities: summarizeCapabilities(entry.scopes),
            executors,
          });
          if (!bootstrapToken && !hasScope(entry.scopes, "space:write")) {
            issues.push({
              code: "SCOPE_MISSING",
              severity: authSource === "active-connection" ? "warning" : "error",
              message: `Missing space:write on ${label?.slug ?? entry.space_id} (cannot apply murrmure/)`,
              fix:
                authSource === "active-connection"
                ? "Local tools connections are read/run only — run mrmr login for operator apply"
                : undefined,
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({ code: "AUTH_CHECK_FAILED", message: String(error) });
  }

  const mcpScan = scanMcpConfig({
    projectPath: discovered.projectPath,
    cwd: discovered.cwd,
    authToken: auth.token,
    linkedSpaceId: discovered.link?.space_id,
  });
  const mcpLive = await probeMcpLiveHealth({
    projectPath: discovered.projectPath,
    cwd: discovered.cwd,
    linkedSpaceId: discovered.link?.space_id,
    auth,
    context: mcpScan.context,
  });
  for (const issue of [...mcpScan.issues, ...mcpLive]) {
    if (issue.severity === "info") {
      continue;
    }
    issues.push({
      code: issue.code,
      message: issue.message,
      severity: issue.severity,
      fix: issue.fix,
      paths: issue.path ? [issue.path] : undefined,
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
  };

  const hasBlocking = coalesceDoctorIssues(issues).some(
    (issue) => issueSeverity(issue) === "error",
  );

  return {
    ok: !hasBlocking,
    issues,
    profile,
  };
}

export async function runDoctorForAuth(auth: HubAuth, cwd?: string): Promise<DoctorResult> {
  return runDoctor({ hubUrl: auth.hubUrl, token: auth.token, cwd });
}
