import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { hubFetch, resolveHubAuth } from "../../auth.js";
import { clearAuthContextCache, getAuthContext } from "../../lib/auth-context.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { cliConsola, exitUsage, printErr, printOk, printScopeError } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { requireScope } from "../../lib/scope.js";
import { printSpaceAdminScopeError } from "../../lib/space-admin-scope.js";
import { buildMcpConfigSnippet } from "../../lib/space-doctor-mcp.js";
import {
  emitHubConfigJson,
  parseCommaList,
  printHubConfigData,
  printMintGrantResult,
} from "../../lib/space-output.js";
import {
  activeGrantPath,
  grantTokenPath,
  readGrantToken,
  setActiveGrantSpace,
  writeGrantToken,
} from "../../lib/grant-store.js";
import { assertSpaceId } from "../../lib/space-id.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

function resolveMcpConfigPath(local: boolean): string {
  if (local) {
    return join(resolve(process.cwd()), ".cursor", "mcp.json");
  }
  return join(homedir(), ".cursor", "mcp.json");
}

function writeThinMcpConfig(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${buildMcpConfigSnippet()}\n`, "utf-8");
}

async function runGrantAdminPreflight(
  flags: ReturnType<typeof parseGlobalFlags>,
  action: string,
) {
  const auth = resolveHubAuth({ hubUrl: flags.hubUrl, token: flags.token });
  if ("error" in auth) {
    printErr("AUTH_MISSING", auth.error);
  }

  const spaceId = assertSpaceId(flags);

  const ctxResult = await getAuthContext(auth);
  if ("error" in ctxResult) {
    printErr(
      ctxResult.status === 401 ? "AUTH_INVALID" : "HUB_ERROR",
      ctxResult.error,
    );
  }

  const scopeErr = requireScope(ctxResult, spaceId, "space:admin");
  if (scopeErr) {
    if (scopeErr.code === "SCOPE_MISSING") {
      printSpaceAdminScopeError(scopeErr, action);
    } else {
      printScopeError(scopeErr);
    }
  }

  return { auth, spaceId, ctx: ctxResult };
}

export const grantListCommand = defineCommand({
  meta: {
    name: "list",
    description: `List agent grants ${requiresLine("space:admin")}`,
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`);
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const grantMintCommand = defineCommand({
  meta: {
    name: "mint",
    description: `Mint a new agent grant ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    label: {
      type: "string",
      description: "Grant label (who this token is for)",
      required: true,
    },
    harness: {
      type: "string",
      description: "Harness id (e.g. cursor-local, ci)",
    },
    template: {
      type: "string",
      description: "Scope template: worker or admin",
    },
    scopes: {
      type: "string",
      description: "Comma-separated scopes (overrides template)",
    },
    capabilities: {
      type: "string",
      description: "Comma-separated rev-1 capabilities (alias for --scopes)",
    },
    "flow-acl": {
      type: "string",
      description: "Comma-separated flow ACL package ids (e.g. review-loop)",
    },
    "expires-days": {
      type: "string",
      description: "Token expiry in days",
    },
    local: {
      type: "boolean",
      description: "Offer writing project .cursor/mcp.json instead of ~/.cursor/mcp.json",
      default: false,
    },
    "write-mcp": {
      type: "boolean",
      description: "Write thin MCP config without interactive prompt",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    if (!args.label) {
      exitUsage("Missing --label. Run `mrmr space grant mint --help`.");
    }

    const { auth, spaceId } = await runGrantAdminPreflight(flags, "mint grants");

    const flowAcl = parseCommaList(
      typeof args["flow-acl"] === "string" ? args["flow-acl"] : undefined,
    );
    const scopes = parseCommaList(
      typeof args.scopes === "string"
        ? args.scopes
        : typeof args.capabilities === "string"
          ? args.capabilities
          : undefined,
    );

    const body: Record<string, unknown> = {
      label: String(args.label),
    };
    if (typeof args.harness === "string" && args.harness) body.harness = args.harness;
    if (typeof args.template === "string" && args.template) body.template = args.template;
    if (scopes) body.scopes = scopes;
    if (flowAcl) body.flow_acl = flowAcl;
    if (typeof args["expires-days"] === "string" && args["expires-days"]) {
      body.expires_in_days = Number(args["expires-days"]);
    }

    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      json: body,
    });
    const responseBody = await emitHubConfigJson(res);
    const token = typeof responseBody.token === "string" ? responseBody.token : undefined;
    const grantId = typeof responseBody.grant_id === "string" ? responseBody.grant_id : undefined;
    const label = typeof responseBody.label === "string" ? responseBody.label : undefined;

    let tokenPath: string | undefined;
    if (token) {
      try {
        tokenPath = writeGrantToken(spaceId, token);
      } catch (error) {
        if (!flags.json) {
          cliConsola.warn(
            `Could not store token under ~/.murrmure/grants: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    if (flags.json) {
      printOk({
        ...responseBody,
        stored_token_path: tokenPath,
      });
      return;
    }

    if (grantId) cliConsola.success(`Grant created: ${grantId}`);
    if (label) cliConsola.info(`Label: ${label}`);
    if (!token) {
      printHubConfigData(responseBody);
      return;
    }

    const mcpConfigPath = resolveMcpConfigPath(Boolean(args.local));
    const writeMcpDirectly = Boolean(args["write-mcp"]);
    let writeMcp = writeMcpDirectly;

    if (!writeMcp && process.stdin.isTTY && process.stdout.isTTY) {
      const answer = await p.confirm({
        message: existsSync(mcpConfigPath)
          ? `Overwrite MCP config at ${mcpConfigPath}?`
          : `Write thin MCP config to ${mcpConfigPath}?`,
        initialValue: !existsSync(mcpConfigPath),
      });
      if (!p.isCancel(answer)) {
        writeMcp = Boolean(answer);
      }
    }

    console.log("");
    console.log(`export MURRMURE_HUB_TOKEN=${token}`);
    console.log("");
    cliConsola.warn("Save this token — it will not be shown again.");

    if (tokenPath) {
      cliConsola.info(`Stored token: ${tokenPath}`);
      cliConsola.info(`Activate it anytime: mrmr grant use --space ${spaceId}`);
    }

    if (writeMcp) {
      writeThinMcpConfig(mcpConfigPath);
      cliConsola.success(`Wrote thin MCP config: ${mcpConfigPath}`);
    } else {
      cliConsola.info(`Skipped MCP config write. Target path: ${mcpConfigPath}`);
    }
  },
}) as CommandDef;

export const grantUseCommand = defineCommand({
  meta: {
    name: "use",
    description: "Activate a stored grant token for one space (Requires: none)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const spaceId = assertSpaceId(flags);
    const explicitToken = typeof args.token === "string" ? args.token.trim() : undefined;

    let token = explicitToken;
    if (!token) {
      token = readGrantToken(spaceId) ?? undefined;
    }
    if (!token) {
      exitUsage(
        `No stored token for ${spaceId}. Mint first with \`mrmr grant mint --space ${spaceId}\` or pass --token.`,
      );
    }

    let tokenPath: string;
    let activePath: string;
    try {
      tokenPath = explicitToken
        ? writeGrantToken(spaceId, explicitToken)
        : grantTokenPath(spaceId);
      activePath = setActiveGrantSpace(spaceId);
    } catch (error) {
      printErr(
        "GRANT_STORE_WRITE_FAILED",
        error instanceof Error ? error.message : "Failed writing grant store files",
      );
    }
    clearAuthContextCache();

    if (flags.json) {
      printOk({
        space_id: spaceId,
        active_path: activePath,
        token_path: tokenPath,
        token_saved: Boolean(explicitToken),
      });
      return;
    }

    cliConsola.success(`Active grant set: ${spaceId}`);
    if (explicitToken) {
      cliConsola.info(`Saved token to ${tokenPath}`);
    } else {
      cliConsola.info(`Using stored token at ${tokenPath}`);
    }
    cliConsola.info(`Active pointer: ${activePath}`);
    cliConsola.info("mrmr whoami now resolves this grant unless env/flags override it.");
  },
}) as CommandDef;

export const grantRevokeCommand = defineCommand({
  meta: {
    name: "revoke",
    description: `Revoke an agent grant ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    grant_id: {
      type: "positional",
      description: "Grant id (grt_…)",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const grantId = typeof args.grant_id === "string" ? args.grant_id : undefined;
    if (!grantId) {
      exitUsage("Missing <grant_id>. Run `mrmr space grant revoke --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/grants/${encodeURIComponent(grantId)}/revoke`,
      { method: "POST" },
    );
    printHubConfigData(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const grantRotateCommand = defineCommand({
  meta: {
    name: "rotate",
    description: `Rotate an agent grant token ${requiresLine("space:admin")}`,
  },
  args: {
    ...globalArgs,
    grant_id: {
      type: "positional",
      description: "Grant id (grt_…)",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const grantId = typeof args.grant_id === "string" ? args.grant_id : undefined;
    if (!grantId) {
      exitUsage("Missing <grant_id>. Run `mrmr space grant rotate --help`.");
    }

    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");

    const res = await hubFetch(
      auth,
      `/v1/spaces/${spaceId}/grants/${encodeURIComponent(grantId)}/rotate`,
      { method: "POST" },
    );
    printMintGrantResult(await emitHubConfigJson(res));
  },
}) as CommandDef;

export const grantCommand = defineCommand({
  meta: { name: "grant", description: "Agent grant management" },
  subCommands: {
    list: grantListCommand,
    mint: grantMintCommand,
    use: grantUseCommand,
    revoke: grantRevokeCommand,
    rotate: grantRotateCommand,
  },
}) as CommandDef;
