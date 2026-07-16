import { homedir, hostname } from "node:os";
import { resolve } from "node:path";
import { defineCommand, type CommandDef } from "citty";
import { hubFetch } from "../auth.js";
import {
  buildConnectionDescriptor,
  detectedConnectionAdapters,
  findConnectionAdapter,
  writeSetupResume,
} from "../lib/connection-adapters.js";
import {
  deleteConnectionToken,
  readActiveConnection,
  readConnectionToken,
  readStoredConnection,
  storeConnectionToken,
  writeActiveConnection,
  writeStoredConnection,
} from "../lib/connection-store.js";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { emitHubConfigJson, parseCommaList } from "../lib/space-output.js";
import { printErr, printOk, cliConsola, exitUsage } from "../lib/output.js";
import { runScopePreflight } from "../lib/preflight.js";
import {
  TUTORIAL_BUILDER_CAPABILITIES,
  TUTORIAL_BUILDER_PROFILE,
} from "../wizard/capabilities.js";

function toConnectionId(grantId: string): string {
  return grantId.replace(/^grt_/, "con_");
}

function toGrantId(connectionId: string): string {
  return connectionId.replace(/^con_/, "grt_");
}

function parseConnectionResponse(body: Record<string, unknown>): {
  connectionId: string;
  token: string;
} {
  const grantId = typeof body.grant_id === "string" ? body.grant_id : "";
  const token = typeof body.token === "string" ? body.token : "";
  if (!grantId || !token) {
    printErr("CONNECTION_CREATE_FAILED", "Hub did not return a complete connection credential.");
  }
  return { connectionId: toConnectionId(grantId), token };
}

const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create and activate a least-privilege local connection (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    label: {
      type: "string",
      description: "Trust-boundary label (default: Local tools on this computer)",
    },
    contexts: {
      type: "string",
      description: "Comma-separated integration context ids (detected by default)",
    },
    "flow-acl": {
      type: "string",
      description: "Advanced: comma-separated already-applied canonical flow ids",
    },
    path: {
      type: "string",
      description: "Project path used for integration-context detection",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");
    const projectPath = resolve(typeof args.path === "string" ? args.path : process.cwd());
    const flowAcl = parseCommaList(
      typeof args["flow-acl"] === "string" ? args["flow-acl"] : undefined,
    );
    const body: Record<string, unknown> = {
      label:
        typeof args.label === "string" && args.label.trim()
          ? args.label.trim()
          : `Local tools on ${hostname()}`,
      harness: "local-tools",
      scopes: [...TUTORIAL_BUILDER_CAPABILITIES],
      profile: TUTORIAL_BUILDER_PROFILE.id,
      ...(flowAcl ? { flow_acl: flowAcl } : {}),
    };
    const response = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      json: body,
    });
    const responseBody = await emitHubConfigJson(response);
    const { connectionId, token } = parseConnectionResponse(responseBody);

    try {
      storeConnectionToken(auth.hubUrl, connectionId, token);
    } catch (error) {
      await hubFetch(
        auth,
        `/v1/spaces/${spaceId}/grants/${toGrantId(connectionId)}/revoke`,
        { method: "POST" },
      ).catch(() => undefined);
      printErr(
        "CREDENTIAL_STORE_WRITE_FAILED",
        error instanceof Error ? error.message : "Could not store connection credential",
      );
    }
    const activePath = writeActiveConnection({
      hub_id: auth.hubUrl,
      connection_id: connectionId,
      space_id: spaceId,
      profile: TUTORIAL_BUILDER_PROFILE.id,
    });
    writeStoredConnection({
      hub_id: auth.hubUrl,
      connection_id: connectionId,
      space_id: spaceId,
      profile: TUTORIAL_BUILDER_PROFILE.id,
      status: "active",
    });
    const descriptor = buildConnectionDescriptor({
      hubId: auth.hubUrl,
      connectionId,
      spaceId,
    });
    const requested = parseCommaList(
      typeof args.contexts === "string" ? args.contexts : undefined,
    );
    const adapters = requested?.length
      ? requested.map((id) => {
          const adapter = findConnectionAdapter(id);
          if (!adapter) exitUsage(`Unknown integration context: ${id}`);
          return adapter;
        })
      : detectedConnectionAdapters({ projectPath });
    const installed = adapters.map((adapter) =>
      adapter.install(descriptor, { projectPath, homePath: homedir() }),
    );
    const resumePath = writeSetupResume({
      descriptor,
      adapters: adapters.map((adapter) => adapter.id),
      next: "reload-and-verify",
    });

    const result = {
      connection_id: connectionId,
      space_id: spaceId,
      label: body.label,
      profile: TUTORIAL_BUILDER_PROFILE.id,
      capabilities: [...TUTORIAL_BUILDER_CAPABILITIES],
      contexts: installed.map((entry) => ({
        adapter_id: entry.adapter_id,
        mode: entry.mode,
        paths: entry.paths,
        reload_required: entry.reload_required,
      })),
      active_path: activePath,
      resume_path: resumePath,
    };
    if (flags.json) {
      printOk(result);
      return;
    }
    cliConsola.success(`Connection created: ${connectionId}`);
    cliConsola.info(`Profile: ${TUTORIAL_BUILDER_PROFILE.id}`);
    for (const entry of installed) {
      if (entry.instructions) {
        console.log(entry.instructions);
      } else {
        cliConsola.info(`Configured ${entry.adapter_id}: ${entry.paths.join(", ")}`);
      }
    }
    cliConsola.info("Reload the selected tools, then call murrmure_space_status.");
  },
}) as CommandDef;

const activateCommand = defineCommand({
  meta: {
    name: "activate",
    description: "Select an existing locally stored connection (Requires: none; local only)",
  },
  args: {
    ...globalArgs,
    connection_id: {
      type: "positional",
      description: "Connection id (con_…)",
      required: true,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const connectionId =
      typeof args.connection_id === "string" ? args.connection_id.trim() : "";
    if (!connectionId.startsWith("con_")) {
      exitUsage("Expected a connection id beginning with con_.");
    }
    const stored = readStoredConnection(connectionId);
    if (!stored) {
      printErr(
        "CONNECTION_UNKNOWN",
        `No locally stored connection descriptor exists for ${connectionId}.`,
      );
    }
    if (stored.status === "revoked") {
      printErr("CONNECTION_REVOKED", `Connection ${connectionId} has been revoked.`);
    }
    try {
      readConnectionToken(stored.hub_id, connectionId);
    } catch (error) {
      printErr(
        "CONNECTION_CREDENTIAL_UNAVAILABLE",
        error instanceof Error ? error.message : "Connection credential unavailable",
      );
    }
    const path = writeActiveConnection({
      hub_id: stored.hub_id,
      connection_id: connectionId,
      space_id: stored.space_id,
      profile: stored.profile,
    });
    if (flags.json) {
      printOk({ connection_id: connectionId, space_id: stored.space_id, active_path: path });
      return;
    }
    cliConsola.success(`Active connection: ${connectionId}`);
  },
}) as CommandDef;

const listCommand = defineCommand({
  meta: { name: "list", description: "List space connections (Requires: space:admin)" },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const { auth, spaceId } = await runScopePreflight(flags, "space:admin");
    const response = await hubFetch(auth, `/v1/spaces/${spaceId}/grants`);
    const body = await emitHubConfigJson(response);
    const grants = Array.isArray(body.grants)
      ? body.grants.map((entry) => {
          const row = entry as Record<string, unknown>;
          return {
            ...row,
            connection_id:
              typeof row.grant_id === "string" ? toConnectionId(row.grant_id) : undefined,
            grant_id: undefined,
          };
        })
      : [];
    printOk({ connections: grants });
  },
}) as CommandDef;

const verifyCommand = defineCommand({
  meta: {
    name: "verify",
    description: "Verify the active connection after reloading local tools (Requires: space:read)",
  },
  args: globalArgs,
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const active = readActiveConnection();
    if (!active) {
      printErr("CONNECTION_MISSING", "No active local connection is available.");
    }
    const { auth, spaceId } = await runScopePreflight(flags, "space:read");
    if (
      active.hub_id !== auth.hubUrl ||
      active.space_id !== spaceId
    ) {
      printErr(
        "CONNECTION_ASSOCIATION_MISMATCH",
        "The active connection does not match the selected Hub and space.",
      );
    }

    const statusResponse = await hubFetch(auth, "/v1/mcp/tools/call", {
      method: "POST",
      json: {
        name: "murrmure_space_status",
        space_id: spaceId,
        arguments: {},
      },
    });
    await emitHubConfigJson(statusResponse);

    const catalogResponse = await hubFetch(
      auth,
      `/v1/mcp/catalog?space_id=${encodeURIComponent(spaceId)}`,
    );
    const catalog = await emitHubConfigJson(catalogResponse);
    const tools = Array.isArray(catalog.tools)
      ? catalog.tools
          .map((entry) =>
            entry && typeof entry === "object"
              ? (entry as Record<string, unknown>).name
              : undefined,
          )
          .filter((name): name is string => typeof name === "string")
      : [];
    if (!tools.includes("murrmure_resolve_step")) {
      printErr(
        "CONNECTION_CAPABILITY_MISMATCH",
        "The active connection does not expose the authorized resolve capability.",
      );
    }
    const descriptor = buildConnectionDescriptor({
      hubId: active.hub_id,
      connectionId: active.connection_id,
      spaceId: active.space_id,
    });
    const resumePath = writeSetupResume({
      descriptor,
      adapters: [],
      next: "complete",
    });
    printOk({
      connection_id: active.connection_id,
      space_id: spaceId,
      status: "verified",
      checks: ["murrmure_space_status", "murrmure_resolve_step"],
      resume_path: resumePath,
    });
  },
}) as CommandDef;

function lifecycleCommand(action: "revoke" | "rotate"): CommandDef {
  return defineCommand({
    meta: {
      name: action,
      description: `${action === "revoke" ? "Revoke" : "Rotate"} a connection (Requires: space:admin)`,
    },
    args: {
      ...globalArgs,
      connection_id: {
        type: "positional",
        description: "Connection id (con_…)",
        required: true,
      },
    },
    async run({ args }) {
      const flags = parseGlobalFlags(args);
      const { auth, spaceId } = await runScopePreflight(flags, "space:admin");
      const connectionId =
        typeof args.connection_id === "string" ? args.connection_id.trim() : "";
      if (!connectionId.startsWith("con_")) exitUsage("Expected a connection id beginning with con_.");
      const response = await hubFetch(
        auth,
        `/v1/spaces/${spaceId}/grants/${toGrantId(connectionId)}/${action}`,
        { method: "POST" },
      );
      const body = await emitHubConfigJson(response);
      if (action === "revoke") {
        deleteConnectionToken(auth.hubUrl, connectionId);
        writeStoredConnection({
          hub_id: auth.hubUrl,
          connection_id: connectionId,
          space_id: spaceId,
          profile: TUTORIAL_BUILDER_PROFILE.id,
          status: "revoked",
        });
        printOk({ connection_id: connectionId, status: "revoked" });
        return;
      }
      const rotated = parseConnectionResponse(body);
      storeConnectionToken(auth.hubUrl, rotated.connectionId, rotated.token);
      deleteConnectionToken(auth.hubUrl, connectionId);
      writeStoredConnection({
        hub_id: auth.hubUrl,
        connection_id: connectionId,
        space_id: spaceId,
        profile: TUTORIAL_BUILDER_PROFILE.id,
        status: "revoked",
      });
      writeStoredConnection({
        hub_id: auth.hubUrl,
        connection_id: rotated.connectionId,
        space_id: spaceId,
        profile: TUTORIAL_BUILDER_PROFILE.id,
        status: "active",
      });
      writeActiveConnection({
        hub_id: auth.hubUrl,
        connection_id: rotated.connectionId,
        space_id: spaceId,
        profile: TUTORIAL_BUILDER_PROFILE.id,
      });
      printOk({ connection_id: rotated.connectionId, status: "active" });
    },
  }) as CommandDef;
}

export const connectionCommand = defineCommand({
  meta: {
    name: "connection",
    description: "Local trust-boundary connection management",
  },
  subCommands: {
    create: createCommand,
    activate: activateCommand,
    verify: verifyCommand,
    list: listCommand,
    revoke: lifecycleCommand("revoke"),
    rotate: lifecycleCommand("rotate"),
  },
}) as CommandDef;
