import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import type { HubAuth } from "../auth.js";
import { fetchWhoami } from "./auth-context.js";
import { readCredentials } from "./auth-store.js";
import type { SpaceDoctorIssue } from "./space-doctor.js";

const LEGACY_MCP_COMMANDS = new Set(["studio-hub-mcp", "studio"]);
const PLACEHOLDER_TOKEN =
  /^(tok_\.{3}|tok_<|tok_\.\.\.|tok_test|replace|your[_-]?token|<token>|changeme)$/i;

const FAT_MCP_ENV_KEYS = [
  "MURRMURE_HUB_URL",
  "MURRMURE_SPACE_ID",
  "MURRMURE_API_URL",
  "MURRMURE_API_TOKEN",
] as const;
const MCP_CONFIG_WARN_ENV_KEYS = ["MURRMURE_HUB_URL", "MURRMURE_SPACE_ID"] as const;
const MCP_ENV_REFERENCE = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;
const SHARED_DISCOVERY_RELATIVE_PATH = join(".murrmure", "hubs", "shared.json");

interface SharedHubEntry {
  endpoint?: unknown;
}

interface SharedDiscoveryFile {
  hubs?: unknown;
  url?: unknown;
}

interface CatalogTool {
  name: string;
  inputSchema?: Record<string, unknown>;
}

interface CatalogProbeFailure {
  status?: number;
  message: string;
}

interface CatalogProbeSuccess {
  tools: CatalogTool[];
}

export interface McpLiveProbeOptions {
  projectPath: string;
  cwd: string;
  linkedSpaceId?: string;
  auth?: HubAuth;
  context: SpaceDoctorMcpContext;
}

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

type RawMcpConfig = {
  mcpServers?: Record<string, RawMcpServer>;
};

function pushIssue(issues: SpaceDoctorIssue[], issue: SpaceDoctorIssue): void {
  issues.push(issue);
}

export function resolveMcpBridgeCommand(options?: { homePath?: string }): string {
  const sharedPath = join(options?.homePath ?? homedir(), SHARED_DISCOVERY_RELATIVE_PATH);
  if (!existsSync(sharedPath)) {
    return "murrmure-mcp";
  }
  try {
    const parsed = JSON.parse(readFileSync(sharedPath, "utf-8")) as {
      mcp_bridge?: { command?: unknown };
    };
    const command = parsed.mcp_bridge?.command;
    if (typeof command === "string" && command.trim()) {
      return command.trim();
    }
  } catch {
    // Fall back to PATH lookup name.
  }
  return "murrmure-mcp";
}

export function buildMcpConfigSnippet(options?: {
  token?: string;
  command?: string;
}): string {
  const command = options?.command ?? resolveMcpBridgeCommand();
  return JSON.stringify(
    {
      mcpServers: {
        murrmure: {
          command,
          env: {
            MURRMURE_HUB_TOKEN: options?.token ?? "${env:MURRMURE_HUB_TOKEN}",
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
    if (parent === current || (!parent.startsWith(projectRoot) && parent !== projectRoot)) {
      break;
    }
    current = parent;
  }

  const globalConfig = join(homedir(), ".cursor", "mcp.json");
  if (existsSync(globalConfig)) {
    found.add(globalConfig);
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

function sanitizeArgs(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function commandBasename(command: string | undefined): string {
  if (!command) return "";
  return command.split(/[/\\]/).pop()?.toLowerCase() ?? command.toLowerCase();
}

function commandLooksLegacy(command: string | undefined, args: string[] | undefined): boolean {
  if (!command) {
    return false;
  }
  const base = commandBasename(command);
  if (LEGACY_MCP_COMMANDS.has(base)) {
    return true;
  }
  if (base === "pnpm" || base === "npm" || base === "npx") {
    const joined = (args ?? []).join(" ").toLowerCase();
    if (joined.includes("studio-hub-mcp")) {
      return true;
    }
  }
  return false;
}

function isMurrmureRelatedServer(server: RawMcpServer): boolean {
  const command = typeof server.command === "string" ? server.command.toLowerCase() : "";
  const args = sanitizeArgs(server.args) ?? [];
  const env = asStringRecord(server.env);
  const envKeys = Object.keys(env).join(" ");
  if (/murrmure|mrmr|studio/.test(command)) return true;
  if (args.includes("mcp")) return true;
  if (/MURRMURE_|STUDIO_/.test(envKeys)) return true;
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
      args: sanitizeArgs(raw.args),
      env: asStringRecord(raw.env),
    });
  }

  if (Object.keys(mcpServers as object).length > 0 && servers.length === 0) {
    pushIssue(issues, {
      code: "MCP_NO_MURRMURE_SERVER",
      severity: "info",
      message: `${relPath} defines MCP servers but none look like Murrmure`,
      path: relPath,
      fix: `Add a murrmure entry using "command": "murrmure-mcp"`,
    });
  }

  return { servers, issues };
}

function validateMurrmureServer(server: McpServerEntry): SpaceDoctorIssue[] {
  const issues: SpaceDoctorIssue[] = [];
  const relConfig = server.config_path;
  const label = `${server.name} in ${relConfig}`;
  const base = commandBasename(server.command);
  const args = server.args ?? [];

  const usesCanonicalBridge =
    base === "murrmure-mcp" || (server.command?.endsWith("/murrmure-mcp") ?? false);
  const usesFatCliShape =
    (base === "murrmure" || base === "mrmr") && args.length === 1 && args[0] === "mcp";
  const aliasPattern = /^mrmr[-_]mcp$/;
  const usesForbiddenAlias =
    aliasPattern.test(base) || aliasPattern.test(server.command?.split(/[/\\]/).pop() ?? "");

  if (usesFatCliShape) {
    pushIssue(issues, {
      code: "MCP_FAT_COMMAND_SHAPE",
      severity: "error",
      message: `${label} uses fat CLI MCP shape ("murrmure" + args ["mcp"]) — use "murrmure-mcp"`,
      path: relConfig,
      fix: `Update ${relConfig} → "command": "murrmure-mcp"`,
    });
  } else if (usesForbiddenAlias) {
    pushIssue(issues, {
      code: "MCP_ALIAS_COMMAND",
      severity: "error",
      message: `${label} uses unsupported alias "${server.command}" — use "murrmure-mcp"`,
      path: relConfig,
      fix: `Update ${relConfig} → "command": "murrmure-mcp"`,
    });
  } else if (commandLooksLegacy(server.command, server.args)) {
    pushIssue(issues, {
      code: "MCP_LEGACY_COMMAND",
      severity: "warning",
      message: `${label} uses legacy MCP command`,
      path: relConfig,
      fix: `Update ${relConfig} → "command": "murrmure-mcp"`,
    });
  } else if (server.command && /murrmure|mrmr/.test(base) && !usesCanonicalBridge) {
    pushIssue(issues, {
      code: "MCP_COMMAND_UNEXPECTED",
      severity: "warning",
      message: `${label} uses "${server.command}" — expected "murrmure-mcp"`,
      path: relConfig,
      fix: `Update ${relConfig} → "command": "murrmure-mcp"`,
    });
  }

  const fatEnvKeys = FAT_MCP_ENV_KEYS.filter((key) => server.env[key]);
  if (fatEnvKeys.length > 0) {
    pushIssue(issues, {
      code: "MCP_FAT_ENV_KEYS",
      severity: "error",
      message: `${label} still sets fat MCP env keys: ${fatEnvKeys.join(", ")}`,
      path: relConfig,
      fix: `Remove ${fatEnvKeys.join(", ")} from ${relConfig}; keep only MURRMURE_HUB_TOKEN`,
    });
  }

  const warnedShapeKeys = MCP_CONFIG_WARN_ENV_KEYS.filter((key) => server.env[key]);
  if (warnedShapeKeys.length > 0) {
    pushIssue(issues, {
      code: "MCP_CONFIG_SHAPE",
      severity: "warning",
      message: `${label} still sets ${warnedShapeKeys.join(", ")} in mcp.json — thin config should only set MURRMURE_HUB_TOKEN`,
      path: relConfig,
      fix: `Remove ${warnedShapeKeys.join(", ")} from ${relConfig}`,
    });
  }

  const token = server.env.MURRMURE_HUB_TOKEN;
  if (!token) {
    pushIssue(issues, {
      code: "MCP_MISSING_TOKEN",
      severity: "warning",
      message: `${label} missing MURRMURE_HUB_TOKEN`,
      path: relConfig,
      fix: "Set MURRMURE_HUB_TOKEN (or ${env:MURRMURE_HUB_TOKEN})",
    });
  } else if (PLACEHOLDER_TOKEN.test(token.trim())) {
    pushIssue(issues, {
      code: "MCP_PLACEHOLDER_TOKEN",
      severity: "warning",
      message: `${label} still has a placeholder token`,
      path: relConfig,
      fix: "Mint a grant token with mrmr grant mint --space <spc_…>",
    });
  }

  return issues;
}

function shouldRewriteToThinShape(server: RawMcpServer): boolean {
  const command = typeof server.command === "string" ? server.command : undefined;
  const args = sanitizeArgs(server.args);
  const env = asStringRecord(server.env);
  const base = commandBasename(command);
  const usesCanonicalBridge =
    base === "murrmure-mcp" || (command?.endsWith("/murrmure-mcp") ?? false);
  const usesFatCliShape = (base === "murrmure" || base === "mrmr") && args?.length === 1 && args[0] === "mcp";
  const aliasPattern = /^mrmr[-_]mcp$/;
  const usesForbiddenAlias = aliasPattern.test(base) || aliasPattern.test(command?.split(/[/\\]/).pop() ?? "");
  const hasFatEnvKeys = FAT_MCP_ENV_KEYS.some((key) => Boolean(env[key]));
  const hasAnyArgs = Array.isArray(server.args) ? server.args.length > 0 : server.args !== undefined;
  const hasUnexpectedCommand =
    Boolean(command) &&
    /murrmure|mrmr/.test(base) &&
    !usesCanonicalBridge;
  return (
    usesFatCliShape ||
    usesForbiddenAlias ||
    commandLooksLegacy(command, args) ||
    hasFatEnvKeys ||
    hasAnyArgs ||
    hasUnexpectedCommand ||
    !usesCanonicalBridge
  );
}

function normalizeToThinShape(
  server: RawMcpServer,
  options?: { tokenFallback?: string },
): RawMcpServer {
  const env = asStringRecord(server.env);
  const token =
    env.MURRMURE_HUB_TOKEN?.trim() ||
    options?.tokenFallback?.trim() ||
    "${env:MURRMURE_HUB_TOKEN}";
  return {
    command: "murrmure-mcp",
    env: {
      MURRMURE_HUB_TOKEN: token,
    },
  };
}

export function rewriteFatMcpConfigFiles(options: {
  configPaths: string[];
  tokenFallback?: string;
}): {
  rewritten: string[];
  errors: Array<{ path: string; message: string }>;
} {
  const rewritten: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  for (const configPath of options.configPaths) {
    let parsed: RawMcpConfig;
    try {
      parsed = JSON.parse(readFileSync(configPath, "utf-8")) as RawMcpConfig;
    } catch (error) {
      errors.push({
        path: configPath,
        message: error instanceof Error ? error.message : "invalid JSON",
      });
      continue;
    }

    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      continue;
    }

    let changed = false;
    for (const [name, raw] of Object.entries(parsed.mcpServers)) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      if (!isMurrmureRelatedServer(raw)) {
        continue;
      }
      if (!shouldRewriteToThinShape(raw)) {
        continue;
      }
      parsed.mcpServers[name] = normalizeToThinShape(raw, {
        tokenFallback: options.tokenFallback,
      });
      changed = true;
    }

    if (!changed) {
      continue;
    }

    writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
    rewritten.push(configPath);
  }

  return { rewritten, errors };
}

export function scanMcpConfig(options: {
  projectPath: string;
  cwd: string;
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
      message: `No MCP config found (.cursor/mcp.json or ~/.cursor/mcp.json)`,
      path: relative(options.projectPath, suggestedConfigPath),
      fix: `Create ${relative(options.projectPath, suggestedConfigPath)} with the thin bridge shape`,
    });
  }

  for (const configPath of configPaths) {
    const parsed = parseMcpFile(configPath);
    issues.push(...parsed.issues);
    servers.push(...parsed.servers);
    for (const server of parsed.servers) {
      issues.push(...validateMurrmureServer(server));
    }
  }

  const primaryServer = servers[0];
  const snippet = buildMcpConfigSnippet({
    token: options.authToken ?? primaryServer?.env.MURRMURE_HUB_TOKEN,
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

function normalizeHubEndpoint(endpoint: string | undefined): string | null {
  if (!endpoint) {
    return null;
  }
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function summarizeBody(body: unknown): string {
  if (typeof body === "string") {
    return body.slice(0, 200);
  }
  if (body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string") {
    return String((body as { message: string }).message).slice(0, 200);
  }
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return String(body).slice(0, 200);
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseEnvTokenRef(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.trim().match(MCP_ENV_REFERENCE);
  return match?.[1];
}

function resolveSharedDiscoveryEndpoint(homePath: string = homedir()): {
  sharedPath: string;
  endpoint?: string;
  error?: string;
} {
  const sharedPath = join(homePath, SHARED_DISCOVERY_RELATIVE_PATH);
  if (!existsSync(sharedPath)) {
    return {
      sharedPath,
      error: `Missing ${sharedPath}`,
    };
  }

  let parsed: SharedDiscoveryFile;
  try {
    parsed = JSON.parse(readFileSync(sharedPath, "utf-8")) as SharedDiscoveryFile;
  } catch (error) {
    return {
      sharedPath,
      error: `Invalid JSON in ${sharedPath} — ${error instanceof Error ? error.message : "parse failed"}`,
    };
  }

  const candidates: string[] = [];
  if (Array.isArray(parsed.hubs)) {
    for (const entry of parsed.hubs as SharedHubEntry[]) {
      if (entry && typeof entry.endpoint === "string") {
        candidates.push(entry.endpoint);
      }
    }
  }
  if (typeof parsed.url === "string") {
    candidates.push(parsed.url);
  }

  for (const candidate of candidates) {
    const normalized = normalizeHubEndpoint(candidate);
    if (normalized) {
      return { sharedPath, endpoint: normalized };
    }
  }

  return {
    sharedPath,
    error: `No usable hub endpoint found in ${sharedPath}`,
  };
}

function inspectConfiguredTokenSources(context: SpaceDoctorMcpContext): {
  hasInlineToken: boolean;
  hasEnvReference: boolean;
  resolvedFromReference?: string;
  firstEnvReference?: string;
  inlineToken?: string;
} {
  let hasInlineToken = false;
  let hasEnvReference = false;
  let resolvedFromReference: string | undefined;
  let firstEnvReference: string | undefined;
  let inlineToken: string | undefined;

  for (const server of context.servers) {
    const rawToken = server.env.MURRMURE_HUB_TOKEN?.trim();
    if (!rawToken) {
      continue;
    }
    const envRef = parseEnvTokenRef(rawToken);
    if (envRef) {
      hasEnvReference = true;
      firstEnvReference ??= envRef;
      const envValue = process.env[envRef]?.trim();
      if (envValue && !resolvedFromReference) {
        resolvedFromReference = envValue;
      }
      continue;
    }
    if (!PLACEHOLDER_TOKEN.test(rawToken)) {
      hasInlineToken = true;
      inlineToken ??= rawToken;
    }
  }

  return {
    hasInlineToken,
    hasEnvReference,
    resolvedFromReference,
    firstEnvReference,
    inlineToken,
  };
}

function resolveProbeToken(
  context: SpaceDoctorMcpContext,
  auth?: HubAuth,
): string | undefined {
  const configured = inspectConfiguredTokenSources(context);
  if (configured.inlineToken) {
    return configured.inlineToken;
  }
  if (configured.resolvedFromReference) {
    return configured.resolvedFromReference;
  }
  return auth?.token;
}

async function fetchCatalogTools(options: {
  hubUrl: string;
  token: string;
}): Promise<CatalogProbeSuccess | CatalogProbeFailure> {
  try {
    const url = new URL(`${options.hubUrl.replace(/\/$/, "")}/v1/mcp/catalog`);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${options.token}` },
    });
    const body = await parseBody(res);
    if (!res.ok) {
      return {
        status: res.status,
        message: `Hub MCP catalog returned HTTP ${res.status} — ${summarizeBody(body)}`,
      };
    }

    const rawTools = (body as { tools?: unknown }).tools;
    if (!Array.isArray(rawTools)) {
      return { message: "Hub MCP catalog response missing tools array" };
    }

    const tools: CatalogTool[] = [];
    for (const entry of rawTools) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const name = (entry as { name?: unknown }).name;
      if (typeof name !== "string" || !name.trim()) {
        continue;
      }
      const inputSchema = (entry as { inputSchema?: unknown }).inputSchema;
      tools.push({
        name,
        inputSchema:
          inputSchema && typeof inputSchema === "object"
            ? (inputSchema as Record<string, unknown>)
            : undefined,
      });
    }

    return { tools };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Could not reach hub MCP catalog",
    };
  }
}

export async function probeMcpLiveHealth(
  options: McpLiveProbeOptions,
): Promise<SpaceDoctorIssue[]> {
  const issues: SpaceDoctorIssue[] = [];
  const discovery = resolveSharedDiscoveryEndpoint();
  const discoveryProblems: string[] = [];
  const authHubUrl = normalizeHubEndpoint(options.auth?.hubUrl);
  const discoveryEndpoint = discovery.endpoint;

  if (discovery.error) {
    discoveryProblems.push(discovery.error);
  } else if (discoveryEndpoint) {
    if (authHubUrl && authHubUrl !== discoveryEndpoint) {
      discoveryProblems.push(
        `shared.json endpoint ${discoveryEndpoint} does not match live hub ${authHubUrl}`,
      );
    }
    try {
      const health = await fetch(`${discoveryEndpoint}/v1/health`);
      if (!health.ok) {
        discoveryProblems.push(`/v1/health returned HTTP ${health.status} for ${discoveryEndpoint}`);
      }
    } catch (error) {
      discoveryProblems.push(
        error instanceof Error
          ? `health check failed for ${discoveryEndpoint}: ${error.message}`
          : `health check failed for ${discoveryEndpoint}`,
      );
    }
  }

  if (discoveryProblems.length > 0) {
    pushIssue(issues, {
      code: "MCP_DISCOVERY",
      severity: "warning",
      message: discoveryProblems.join("; "),
      path: discovery.sharedPath,
      fix: "Start the hub/desktop and ensure ~/.murrmure/hubs/shared.json points at the current hub",
    });
  }

  const configuredTokens = inspectConfiguredTokenSources(options.context);
  const envToken =
    process.env.MURRMURE_HUB_TOKEN?.trim() ||
    process.env.MURRMURE_TOKEN?.trim() ||
    process.env.MURRMURE_DEPLOY_TOKEN?.trim();
  const credentialsToken = readCredentials()?.token?.trim();
  const tokenConfigured =
    Boolean(envToken) ||
    Boolean(credentialsToken) ||
    configuredTokens.hasEnvReference ||
    configuredTokens.hasInlineToken;
  if (!tokenConfigured) {
    pushIssue(issues, {
      code: "MCP_TOKEN_SET",
      severity: "warning",
      message:
        "MURRMURE_HUB_TOKEN is not configured for MCP (expected env var, credentials token, or ${env:…} reference in mcp.json)",
      fix: "Set MURRMURE_HUB_TOKEN and keep mcp.json token as ${env:MURRMURE_HUB_TOKEN}",
    });
  }

  if (options.linkedSpaceId) {
    if (!options.auth) {
      pushIssue(issues, {
        code: "MCP_TOKEN_SPACE_MATCH",
        severity: "warning",
        message:
          "Cannot verify token space against .mrmr/space/space.yaml because hub auth is not configured",
        path: relative(options.projectPath, join(options.projectPath, ".mrmr", "space", "space.yaml")),
        fix: `Run mrmr grant use --space ${options.linkedSpaceId}`,
      });
    } else {
      const whoami = await fetchWhoami(options.auth);
      if ("error" in whoami) {
        pushIssue(issues, {
          code: "MCP_TOKEN_SPACE_MATCH",
          severity: "warning",
          message: `Could not verify token space for ISSUE-07 check — ${whoami.error}`,
          path: relative(options.projectPath, join(options.projectPath, ".mrmr", "space", "space.yaml")),
          fix: `Run mrmr grant use --space ${options.linkedSpaceId}`,
        });
      } else {
        const tokenSpaces = Array.isArray((whoami as { spaces?: unknown }).spaces)
          ? (whoami as { spaces: Array<{ space_id: string }> }).spaces
              .map((space) => space.space_id)
              .filter((spaceId) => typeof spaceId === "string" && spaceId.length > 0)
          : [];
        if (tokenSpaces.length === 0) {
          pushIssue(issues, {
            code: "MCP_TOKEN_SPACE_MATCH",
            severity: "warning",
            message: "Could not read token space list from /v1/auth/whoami for ISSUE-07 check",
            path: relative(options.projectPath, join(options.projectPath, ".mrmr", "space", "space.yaml")),
            fix: `Run mrmr grant use --space ${options.linkedSpaceId}`,
          });
        } else if (!tokenSpaces.includes(options.linkedSpaceId)) {
          pushIssue(issues, {
            code: "MCP_TOKEN_SPACE_MATCH",
            severity: "warning",
            message: `Token grants ${tokenSpaces.join(", ")} but workspace is linked to ${options.linkedSpaceId} (ISSUE-07)`,
            path: relative(options.projectPath, join(options.projectPath, ".mrmr", "space", "space.yaml")),
            fix: `Run mrmr grant use --space ${options.linkedSpaceId} (or mint a grant for that space)`,
          });
        }
      }
    }
  }

  const probeHubUrl = authHubUrl ?? discoveryEndpoint;
  const probeToken = resolveProbeToken(options.context, options.auth);
  if (!probeHubUrl || !probeToken) {
    pushIssue(issues, {
      code: "MCP_CATALOG_LIVE",
      severity: "warning",
      message: "Cannot run live MCP catalog check — missing hub URL or probe token",
      fix: "Configure MCP discovery and MURRMURE_HUB_TOKEN, then rerun mrmr space doctor",
    });
    pushIssue(issues, {
      code: "MCP_SCHEMA_PRESENT",
      severity: "warning",
      message: "Cannot verify murrmure_resolve_step schema — live catalog check did not run",
      fix: "Configure MCP discovery and MURRMURE_HUB_TOKEN, then rerun mrmr space doctor",
    });
    pushIssue(issues, {
      code: "MCP_PROBE_INVOKE",
      severity: "warning",
      message: "Cannot invoke murrmure_space_status — missing hub URL or probe token",
      fix: "Set MURRMURE_HUB_TOKEN and verify .cursor/mcp.json thin config",
    });
    return issues;
  }

  const catalog = await fetchCatalogTools({
    hubUrl: probeHubUrl,
    token: probeToken,
  });

  if ("message" in catalog) {
    pushIssue(issues, {
      code: "MCP_CATALOG_LIVE",
      severity: "warning",
      message: catalog.message,
      fix: "Verify grant scopes (space:read, step:resolve) and active grant selection",
    });
    pushIssue(issues, {
      code: "MCP_SCHEMA_PRESENT",
      severity: "warning",
      message: "Cannot verify murrmure_resolve_step schema because catalog probe failed",
      fix: "Fix MCP_CATALOG_LIVE first, then rerun mrmr space doctor",
    });
  } else {
    const byName = new Map(catalog.tools.map((tool) => [tool.name, tool]));
    const requiredTools = ["murrmure_resolve_step", "murrmure_space_status"];
    const missing = requiredTools.filter((name) => !byName.has(name));
    if (missing.length > 0) {
      pushIssue(issues, {
        code: "MCP_CATALOG_LIVE",
        severity: "warning",
        message: `Live MCP catalog is missing required tool(s): ${missing.join(", ")}`,
        fix: "Use a grant with step:resolve + space:read capabilities for this space",
      });
    }

    const resolveTool = byName.get("murrmure_resolve_step");
    const schema = resolveTool?.inputSchema;
    const required =
      schema && Array.isArray((schema as { required?: unknown }).required)
        ? ((schema as { required: unknown[] }).required.filter(
            (entry): entry is string => typeof entry === "string" && entry.length > 0,
          ) as string[])
        : [];
    const hasSchemaObject =
      schema !== undefined &&
      typeof schema === "object" &&
      Object.keys(schema as Record<string, unknown>).length > 0;
    if (!hasSchemaObject || required.length === 0) {
      pushIssue(issues, {
        code: "MCP_SCHEMA_PRESENT",
        severity: "warning",
        message:
          "murrmure_resolve_step is missing a non-empty inputSchema.required declaration in live catalog",
        fix: "Update/restart hub daemon so MCP catalog emits full inputSchema metadata",
      });
    }
  }

  try {
    const invokeRes = await fetch(`${probeHubUrl.replace(/\/$/, "")}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${probeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_space_status",
        arguments: {},
      }),
    });
    if (!invokeRes.ok) {
      const body = await parseBody(invokeRes);
      const denied = invokeRes.status === 401 || invokeRes.status === 403;
      pushIssue(issues, {
        code: "MCP_PROBE_INVOKE",
        severity: "warning",
        message: denied
          ? `murrmure_space_status probe denied (HTTP ${invokeRes.status}) — token may be revoked or bound to another space`
          : `murrmure_space_status probe failed with HTTP ${invokeRes.status} — ${summarizeBody(body)}`,
        fix: options.linkedSpaceId
          ? `Run mrmr grant use --space ${options.linkedSpaceId} and retry`
          : "Verify grant scopes and token validity with mrmr whoami",
      });
    }
  } catch (error) {
    pushIssue(issues, {
      code: "MCP_PROBE_INVOKE",
      severity: "warning",
      message:
        error instanceof Error
          ? `murrmure_space_status probe failed: ${error.message}`
          : "murrmure_space_status probe failed",
      fix: "Ensure hub is reachable and MURRMURE_HUB_TOKEN is valid",
    });
  }

  return issues;
}

export async function probeMcpCatalog(options: {
  hubUrl: string;
  token: string;
}): Promise<SpaceDoctorIssue[]> {
  const issues: SpaceDoctorIssue[] = [];
  const result = await fetchCatalogTools(options);
  if ("message" in result) {
    if (result.status) {
      pushIssue(issues, {
        code: "MCP_CATALOG_DENIED",
        severity: "warning",
        message: result.message,
      });
      return issues;
    }
    pushIssue(issues, {
      code: "MCP_CATALOG_UNREACHABLE",
      severity: "info",
      message: result.message,
    });
    return issues;
  }

  if (result.tools.length === 0) {
    pushIssue(issues, {
      code: "MCP_CATALOG_EMPTY",
      severity: "warning",
      message: "Hub MCP catalog is empty — check grant scopes and space apply",
      fix: "mrmr grant mint --space <spc_…>",
    });
  }
  return issues;
}
