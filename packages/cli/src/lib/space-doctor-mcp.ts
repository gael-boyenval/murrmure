import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { SpaceDoctorIssue } from "./space-doctor.js";

const LEGACY_MCP_COMMANDS = new Set(["studio-hub-mcp", "studio"]);

const LEGACY_MCP_ENV_KEYS = [
  "STUDIO_HUB_URL",
  "STUDIO_HUB_TOKEN",
  "STUDIO_TOKEN",
  "STUDIO_SPACE_ID",
] as const;

const PLACEHOLDER_TOKEN = /^(tok_\.{3}|tok_<|tok_\.\.\.|tok_test|replace|your[_-]?token|<token>|changeme)/i;
const PLACEHOLDER_SPACE = /^(spc_\.{3}|spc_<|spc_\.\.\.|spc_<replace|your[_-]?space|<space>|changeme|my-space)/i;

export interface McpServerEntry {
  name: string;
  config_path: string;
  command?: string;
  args?: string[];
  env: Record<string, string>;
}

export interface SpaceDoctorMcpContext {
  config_paths: string[];
  servers: McpServerEntry[];
  suggested_config_path: string;
  suggested_snippet?: string;
}

type RawMcpServer = {
  command?: unknown;
  args?: unknown;
  env?: unknown;
};

function pushIssue(issues: SpaceDoctorIssue[], issue: SpaceDoctorIssue): void {
  issues.push(issue);
}

export function buildMcpConfigSnippet(options: {
  hubUrl?: string;
  token?: string;
  spaceId?: string;
}): string {
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command: "murrmure",
          args: ["mcp"],
          env: {
            MURRMURE_HUB_URL: (options.hubUrl ?? "http://127.0.0.1:8787").replace(/\/$/, ""),
            MURRMURE_HUB_TOKEN: options.token ?? "tok_…",
            MURRMURE_SPACE_ID: options.spaceId ?? "spc_…",
          },
        },
      },
    },
    null,
    2,
  );
}

function discoverMcpConfigPaths(projectPath: string, cwd: string): string[] {
  const found = new Set<string>();
  const projectRoot = resolve(projectPath);
  const projectConfig = join(projectRoot, ".cursor", "mcp.json");
  if (existsSync(projectConfig)) {
    found.add(projectConfig);
  }

  let current = resolve(cwd);
  for (let depth = 0; depth < 6; depth += 1) {
    if (current === projectRoot || current.startsWith(projectRoot + "/")) {
      const candidate = join(current, ".cursor", "mcp.json");
      if (existsSync(candidate)) {
        found.add(candidate);
      }
    }
    const parent = dirname(current);
    if (parent === current || !parent.startsWith(projectRoot) && parent !== projectRoot) {
      break;
    }
    current = parent;
  }

  return [...found].sort();
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      out[key] = entry;
    }
  }
  return out;
}

function isMurrmureRelatedServer(server: RawMcpServer): boolean {
  const command = typeof server.command === "string" ? server.command.toLowerCase() : "";
  const args = Array.isArray(server.args)
    ? server.args.filter((entry): entry is string => typeof entry === "string")
    : [];
  const env = asStringRecord(server.env);
  const envKeys = Object.keys(env).join(" ");

  if (/murrmure|mrmr|studio/.test(command)) {
    return true;
  }
  if (command.includes("murrmure-mcp") || command.includes("mrmr-mcp")) {
    return true;
  }
  if (args.some((arg) => arg === "mcp")) {
    return true;
  }
  if (/MURRMURE_|STUDIO_/.test(envKeys)) {
    return true;
  }
  return false;
}

function parseMcpFile(configPath: string): {
  servers: McpServerEntry[];
  issues: SpaceDoctorIssue[];
} {
  const issues: SpaceDoctorIssue[] = [];
  const relPath = configPath;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    pushIssue(issues, {
      code: "MCP_INVALID_JSON",
      severity: "error",
      message: `Could not parse ${relPath} — ${error instanceof Error ? error.message : "invalid JSON"}`,
      path: relPath,
      fix: `Fix JSON syntax in ${relPath}`,
    });
    return { servers: [], issues };
  }

  const mcpServers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (!mcpServers || typeof mcpServers !== "object") {
    pushIssue(issues, {
      code: "MCP_SCHEMA_INVALID",
      severity: "warning",
      message: `${relPath} has no mcpServers object`,
      path: relPath,
    });
    return { servers: [], issues };
  }

  const servers: McpServerEntry[] = [];
  for (const [name, raw] of Object.entries(mcpServers as Record<string, RawMcpServer>)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    if (!isMurrmureRelatedServer(raw)) {
      continue;
    }
    servers.push({
      name,
      config_path: configPath,
      command: typeof raw.command === "string" ? raw.command : undefined,
      args: Array.isArray(raw.args)
        ? raw.args.filter((entry): entry is string => typeof entry === "string")
        : undefined,
      env: asStringRecord(raw.env),
    });
  }

  if (Object.keys(mcpServers as object).length > 0 && servers.length === 0) {
    pushIssue(issues, {
      code: "MCP_NO_MURRMURE_SERVER",
      severity: "info",
      message: `${relPath} defines MCP servers but none look like Murrmure (command murrmure + args mcp)`,
      path: relPath,
      fix: `Add a murrmure entry — see apps/docs/guide/agents-mcp.md`,
    });
  }

  return { servers, issues };
}

function commandLooksLegacy(command: string | undefined, args: string[] | undefined): boolean {
  if (!command) {
    return false;
  }
  const base = command.split(/[/\\]/).pop()?.toLowerCase() ?? command.toLowerCase();
  if (LEGACY_MCP_COMMANDS.has(base)) {
    return true;
  }
  if (base === "pnpm" || base === "npm" || base === "npx") {
    const joined = (args ?? []).join(" ").toLowerCase();
    if (joined.includes("studio") && joined.includes("mcp")) {
      return true;
    }
    if (joined.includes("studio-hub-mcp")) {
      return true;
    }
  }
  return false;
}

function readMurrmureEnv(env: Record<string, string>): {
  hubUrl?: string;
  token?: string;
  spaceId?: string;
} {
  return {
    hubUrl: env.MURRMURE_HUB_URL ?? env.MURRMURE_API_URL,
    token: env.MURRMURE_HUB_TOKEN ?? env.MURRMURE_API_TOKEN ?? env.MURRMURE_TOKEN,
    spaceId: env.MURRMURE_SPACE_ID,
  };
}

function validateMurrmureServer(
  server: McpServerEntry,
  options: {
    linkedSpaceId?: string;
    authHubUrl?: string;
    authToken?: string;
  },
): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const relConfig = server.config_path;
  const label = `${server.name} in ${relConfig}`;

  if (commandLooksLegacy(server.command, server.args)) {
    pushIssue(issues, {
      code: "MCP_LEGACY_COMMAND",
      severity: "warning",
      message: `${label} uses legacy MCP command — prefer "murrmure" with args ["mcp"]`,
      path: relConfig,
      fix: `Update ${relConfig} → command: "murrmure", args: ["mcp"]`,
    });
  } else if (server.command && !/murrmure|mrmr/.test(server.command)) {
    pushIssue(issues, {
      code: "MCP_COMMAND_UNEXPECTED",
      severity: "info",
      message: `${label} command is "${server.command}" — expected "murrmure" or "mrmr"`,
      path: relConfig,
    });
  }

  const legacyEnv = LEGACY_MCP_ENV_KEYS.filter((key) => server.env[key]);
  if (legacyEnv.length > 0) {
    pushIssue(issues, {
      code: "MCP_LEGACY_ENV",
      severity: "warning",
      message: `${label} uses legacy env: ${legacyEnv.join(", ")} — rename to MURRMURE_*`,
      path: relConfig,
      fix: "STUDIO_HUB_URL → MURRMURE_HUB_URL, STUDIO_HUB_TOKEN → MURRMURE_HUB_TOKEN, STUDIO_SPACE_ID → MURRMURE_SPACE_ID",
    });
  }

  const murrmureEnv = readMurrmureEnv(server.env);
  if (!murrmureEnv.hubUrl) {
    pushIssue(issues, {
      code: "MCP_MISSING_HUB_URL",
      severity: "warning",
      message: `${label} missing MURRMURE_HUB_URL`,
      path: relConfig,
    });
  }
  if (!murrmureEnv.token) {
    pushIssue(issues, {
      code: "MCP_MISSING_TOKEN",
      severity: "warning",
      message: `${label} missing MURRMURE_HUB_TOKEN (or MURRMURE_TOKEN)`,
      path: relConfig,
      fix: "mrmr grant mint --space <spc_…> --label cursor-agent",
    });
  } else if (PLACEHOLDER_TOKEN.test(murrmureEnv.token.trim())) {
    pushIssue(issues, {
      code: "MCP_PLACEHOLDER_TOKEN",
      severity: "warning",
      message: `${label} still has a placeholder token — mint a real grant`,
      path: relConfig,
      fix: "mrmr grant mint --space <spc_…> --label cursor-agent",
    });
  }

  if (!murrmureEnv.spaceId) {
    pushIssue(issues, {
      code: "MCP_MISSING_SPACE_ID",
      severity: "warning",
      message: `${label} missing MURRMURE_SPACE_ID`,
      path: relConfig,
    });
  } else if (PLACEHOLDER_SPACE.test(murrmureEnv.spaceId.trim())) {
    pushIssue(issues, {
      code: "MCP_PLACEHOLDER_SPACE",
      severity: "warning",
      message: `${label} still has a placeholder space id`,
      path: relConfig,
    });
  } else if (options.linkedSpaceId && murrmureEnv.spaceId !== options.linkedSpaceId) {
    pushIssue(issues, {
      code: "MCP_SPACE_MISMATCH",
      severity: "warning",
      message: `${label} MURRMURE_SPACE_ID=${murrmureEnv.spaceId} but linked space is ${options.linkedSpaceId}`,
      path: relConfig,
      fix: `Set MURRMURE_SPACE_ID to ${options.linkedSpaceId} in ${relConfig}`,
    });
  }

  if (
    murrmureEnv.hubUrl &&
    options.authHubUrl &&
    murrmureEnv.hubUrl.replace(/\/$/, "") !== options.authHubUrl.replace(/\/$/, "")
  ) {
    pushIssue(issues, {
      code: "MCP_HUB_URL_MISMATCH",
      severity: "warning",
      message: `${label} hub URL ${murrmureEnv.hubUrl} differs from CLI auth ${options.authHubUrl}`,
      path: relConfig,
      fix: `Set MURRMURE_HUB_URL to ${options.authHubUrl} in ${relConfig}`,
    });
  }

  if (
    murrmureEnv.token &&
    options.authToken &&
    murrmureEnv.token !== options.authToken &&
    !PLACEHOLDER_TOKEN.test(murrmureEnv.token.trim())
  ) {
    pushIssue(issues, {
      code: "MCP_TOKEN_MISMATCH",
      severity: "info",
      message: `${label} token differs from saved CLI credentials — may be intentional (per-agent grant)`,
      path: relConfig,
    });
  }

  const usesCanonicalMcpSubcommand =
    (server.command === "murrmure" || server.command === "mrmr") &&
    (server.args ?? []).length === 1 &&
    server.args?.[0] === "mcp";
  const usesDeprecatedMcpBinary =
    server.command === "murrmure-mcp" ||
    server.command === "mrmr-mcp" ||
    (server.command?.endsWith("/murrmure-mcp") ?? false) ||
    (server.command?.endsWith("/mrmr-mcp") ?? false);

  if (usesDeprecatedMcpBinary) {
    pushIssue(issues, {
      code: "MCP_LEGACY_COMMAND",
      severity: "warning",
      message: `${label} uses deprecated "${server.command}" — use command "murrmure" with args ["mcp"]`,
      path: relConfig,
      fix: `Update ${relConfig} → "command": "murrmure", "args": ["mcp"]`,
    });
  } else if (server.command && /murrmure|mrmr/.test(server.command) && !usesCanonicalMcpSubcommand) {
    const hasLegacyCommandIssue = issues.some((issue) => issue.code === "MCP_LEGACY_COMMAND");
    if (!hasLegacyCommandIssue) {
      pushIssue(issues, {
        code: "MCP_COMMAND_SHAPE",
        severity: "info",
        message: `${label} — prefer command "murrmure" with args ["mcp"]`,
        path: relConfig,
      });
    }
  }

  return issues;
}

export function scanMcpConfig(options: {
  projectPath: string;
  cwd: string;
  linkedSpaceId?: string;
  authHubUrl?: string;
  authToken?: string;
}): { issues: SpaceDoctorIssue[]; context: SpaceDoctorMcpContext } {
  const issues: SpaceDoctorIssue[] = [];
  const configPaths = discoverMcpConfigPaths(options.projectPath, options.cwd);

  const suggestedConfigPath = join(options.projectPath, ".cursor", "mcp.json");
  const servers: McpServerEntry[] = [];

  if (configPaths.length === 0) {
    pushIssue(issues, {
      code: "MCP_CONFIG_MISSING",
      severity: "warning",
      message: `No .cursor/mcp.json found under ${options.projectPath}`,
      path: relative(options.projectPath, suggestedConfigPath),
      fix: `Create ${relative(options.projectPath, suggestedConfigPath)} (see apps/docs/guide/agents-mcp.md)`,
    });
  }

  for (const configPath of configPaths) {
    const parsed = parseMcpFile(configPath);
    issues.push(...parsed.issues);
    servers.push(...parsed.servers);
    for (const server of parsed.servers) {
      issues.push(
        ...validateMurrmureServer(server, {
          linkedSpaceId: options.linkedSpaceId,
          authHubUrl: options.authHubUrl,
          authToken: options.authToken,
        }),
      );
    }
  }

  const primaryServer = servers[0];
  const snippet = buildMcpConfigSnippet({
    hubUrl: options.authHubUrl ?? primaryServer?.env.MURRMURE_HUB_URL ?? "http://127.0.0.1:8787",
    token: options.authToken ?? primaryServer?.env.MURRMURE_HUB_TOKEN ?? primaryServer?.env.MURRMURE_TOKEN,
    spaceId: options.linkedSpaceId ?? primaryServer?.env.MURRMURE_SPACE_ID,
  });

  return {
    issues,
    context: {
      config_paths: configPaths,
      servers,
      suggested_config_path: suggestedConfigPath,
      suggested_snippet: snippet,
    },
  };
}

export async function probeMcpCatalog(options: {
  hubUrl: string;
  token: string;
  spaceId?: string;
}): Promise<SpaceDoctorIssue[]> {
  const issues: SpaceDoctorIssue[] = [];
  try {
    const url = new URL(`${options.hubUrl.replace(/\/$/, "")}/v1/mcp/catalog`);
    if (options.spaceId) {
      url.searchParams.set("space_id", options.spaceId);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${options.token}` },
    });
    if (!res.ok) {
      pushIssue(issues, {
        code: "MCP_CATALOG_DENIED",
        severity: "warning",
        message: `Hub MCP catalog returned HTTP ${res.status} — token may lack MCP scopes for this space`,
      });
      return issues;
    }
    const body = (await res.json()) as { tools?: unknown[] };
    const count = Array.isArray(body.tools) ? body.tools.length : 0;
    if (count === 0) {
      pushIssue(issues, {
        code: "MCP_CATALOG_EMPTY",
        severity: "warning",
        message: "Hub MCP catalog is empty — check MURRMURE_SPACE_ID, grant scopes, and space apply",
        fix: "mrmr space apply && mrmr grant mint --space <spc_…>",
      });
    }
  } catch (error) {
    pushIssue(issues, {
      code: "MCP_CATALOG_UNREACHABLE",
      severity: "info",
      message: error instanceof Error ? error.message : "Could not reach hub MCP catalog",
    });
  }
  return issues;
}
