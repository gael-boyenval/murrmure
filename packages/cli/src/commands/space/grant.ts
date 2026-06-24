import { defineCommand, type CommandDef } from "citty";
import { hubFetch, resolveHubAuth } from "../../auth.js";
import { getAuthContext } from "../../lib/auth-context.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { exitUsage, printErr, printScopeError } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { requireScope } from "../../lib/scope.js";
import { printSpaceAdminScopeError } from "../../lib/space-admin-scope.js";
import {
  emitHubConfigJson,
  parseCommaList,
  printHubConfigData,
  printMintGrantResult,
} from "../../lib/space-output.js";
import { assertSpaceId } from "../../lib/space-id.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
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
    "flow-acl": {
      type: "string",
      description: "Comma-separated flow ACL package ids (e.g. review-loop)",
    },
    "expires-days": {
      type: "string",
      description: "Token expiry in days",
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
    const scopes = parseCommaList(typeof args.scopes === "string" ? args.scopes : undefined);

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
    printMintGrantResult(await emitHubConfigJson(res));
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
    revoke: grantRevokeCommand,
    rotate: grantRotateCommand,
  },
}) as CommandDef;
