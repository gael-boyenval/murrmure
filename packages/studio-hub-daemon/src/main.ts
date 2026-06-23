import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { serve } from "@hono/node-server";
import { ulid } from "ulid";
import { createSqlitePersistence } from "@murrmure/runtime-persistence";
import { createSqliteStudioPersistence, ensureBootstrapToken, migrateStudio } from "@murrmure/hub-persistence";
import { addSpaceId, createHubKernel, HubHandler, pinContract } from "@murrmure/hub-core";
import { ContractV2Schema } from "@murrmure/contracts";
import type { DaemonConfig, DaemonContext } from "./context.js";
import { createHubApp } from "./routes.js";
import { acquireLock, releaseLock, writeDiscovery } from "./ops.js";
import { MountRegistry } from "./mount-registry.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { ControlBus } from "./control-bus.js";
import { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import { registerPlatformMcpHandlers } from "./mcp-handlers.js";
import { TriggerDispatcher } from "./trigger-dispatcher.js";
import { CapabilityWorkerPool } from "./capability-worker-pool.js";
import { handleWorkerCrash } from "./worker-supervision.js";
import { blobDir } from "./bundle-store.js";
import type { EventAppendCommand } from "@murrmure/contracts";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../fixtures/hub/contracts");
const FEATURE_SPEC_CONTRACT = join(FIXTURES, "feature-spec-v1.json");

export type { DaemonConfig, DaemonContext } from "./context.js";
export { registerCapabilityMounter, mountCapabilities } from "./mount.js";

export async function startHubDaemon(config: DaemonConfig) {
  const lockResult = acquireLock(config, config.port);
  if (lockResult instanceof Response) {
    throw new Error(`Hub already running: ${await lockResult.text()}`);
  }

  mkdirSync(dirname(config.databasePath), { recursive: true });
  const kernelPersistence = createSqlitePersistence(config.databasePath);
  const db = new Database(config.databasePath);
  migrateStudio(db);

  const bootstrapBare = config.bootstrapToken ?? "01JBOOTSTRAPTOKEN00000001";
  ensureBootstrapToken(db, bootstrapBare, "actor_bootstrap", "bootstrap");
  const studioPersistence = createSqliteStudioPersistence(db);

  for (const [refId, file] of [
    ["cref_linear_demo", "linear-demo-v2.json"],
    ["cref_review_loop", "review-loop-v2.json"],
  ] as const) {
    const contractPath = join(FIXTURES, file);
    const contract = ContractV2Schema.parse(JSON.parse(readFileSync(contractPath, "utf-8")));
    await pinContract(studioPersistence, refId, contract);
  }

  const featureSpecContract = ContractV2Schema.parse(JSON.parse(readFileSync(FEATURE_SPEC_CONTRACT, "utf-8")));
  await pinContract(studioPersistence, "cref_feature_spec", featureSpecContract);

  const ids = { ulid: () => ulid() };
  const clock = { nowIso: () => new Date().toISOString() };

  const { kernel } = createHubKernel({ kernelPersistence, studioPersistence, ids, clock });
  const handler = new HubHandler(kernel, studioPersistence, ids, clock);

  const mountRegistry = new MountRegistry();
  const mcpToolRegistry = new McpToolRegistry(mountRegistry, studioPersistence);
  const controlBus = new ControlBus();
  const mcpWakeDispatcher = new McpWakeDispatcher(controlBus, handler);
  const triggerDispatcher = new TriggerDispatcher(studioPersistence, mcpWakeDispatcher, handler);
  const workerPool = new CapabilityWorkerPool();

  const originalExecute = handler.execute.bind(handler);
  handler.execute = async (cmd) => {
    const result = await originalExecute(cmd);
    if (result.outcome === "success" && cmd.kind === "event.append") {
      const eventCmd = cmd as EventAppendCommand;
      const payload = (eventCmd.payload ?? {}) as Record<string, unknown>;
      await triggerDispatcher
        .dispatch({
          event_id: (result.body?.event_id as string) ?? ulid(),
          event_type: eventCmd.event_type,
          space_id: eventCmd.provenance.space_id,
          instance_id: eventCmd.provenance.instance_id,
          payload: { ...payload, type: eventCmd.event_type },
        })
        .catch(() => undefined);
    }
    return result;
  };

  const ctx: DaemonContext = {
    handler,
    studioPersistence,
    config,
    capabilities: ["platform"],
    startedAt: new Date(),
    sseSubscribers: new Set(),
    mountRegistry,
    mcpToolRegistry,
    controlBus,
    mcpWakeDispatcher,
    triggerDispatcher,
    workerPool,
  };

  registerPlatformMcpHandlers(mcpToolRegistry, handler, config);

  const app = createHubApp(ctx);
  ctx.workerPool.setExitHandler((info) =>
    handleWorkerCrash(app, ctx, info.packageId, info.digest, info.exitCode, info.signal),
  );
  const server = serve({ fetch: app.fetch, port: config.port });
  const bound = server.address();
  if (typeof bound === "object" && bound && config.port === 0) {
    config.port = bound.port;
  }
  await seedLiveMounts(app, ctx);

  writeDiscovery(config, config.port);

  const shutdown = () => {
    ctx.workerPool.killAll();
    releaseLock(config);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`Studio hub daemon listening on :${config.port}`);
  return { handler, server, db, ctx };
}

async function seedLiveMounts(app: import("hono").Hono, ctx: DaemonContext): Promise<void> {
  const spaces = await ctx.studioPersistence.listSpaces();
  for (const space of spaces) {
    const installs = await ctx.studioPersistence.listCapabilityInstalls(addSpaceId(space.space_id));
    for (const install of installs) {
      if (install.evolution_state !== "live" || !install.bundle_digest) continue;
      const blobPath = blobDir(ctx.config.dataDir, install.bundle_digest);
      let mcpTools: string[] = [];
      let queryTypes: string[] = [];
      let routesPrefix = install.routes_prefix ?? `/api/${install.package_id}`;
      try {
        const manifestRaw = JSON.parse(readFileSync(join(blobPath, "manifest.json"), "utf-8")) as {
          mcp_tools_by_version?: Record<string, string[]>;
          query_types_by_version?: Record<string, string[]>;
          routes_prefix?: string;
        };
        mcpTools = manifestRaw.mcp_tools_by_version?.[install.version] ?? [];
        queryTypes = manifestRaw.query_types_by_version?.[install.version] ?? [];
        routesPrefix = install.routes_prefix ?? manifestRaw.routes_prefix ?? routesPrefix;
      } catch {
        continue;
      }

      await ctx.workerPool.spawn({
        packageId: install.package_id,
        digest: install.bundle_digest,
        blobPath,
        routesPrefix,
        spaceId: addSpaceId(install.space_id),
        installId: install.install_id,
        contractRefId: install.contract_ref_id,
        version: install.version,
        bridgePort: ctx.config.port,
        installConfig: (install.config as Record<string, unknown>) ?? {},
      });

      await ctx.mountRegistry.apply(app, ctx, {
        install_id: install.install_id,
        space_id: addSpaceId(install.space_id),
        package_id: install.package_id,
        semver: install.version,
        contract_ref_id: install.contract_ref_id,
        routes_prefix: routesPrefix,
        mcp_tools: mcpTools,
        query_types: queryTypes,
        applied_at: new Date().toISOString(),
        bundle_digest: install.bundle_digest,
      });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databasePath = process.env.DATABASE_PATH ?? "./data/studio.db";
  const port = Number(process.env.PORT ?? "8787");
  const dataDir = process.env.STUDIO_DATA_DIR ?? join(homedir(), ".studio");
  const defaultSpaceId = process.env.STUDIO_SPACE_ID ?? "";
  await startHubDaemon({ databasePath, port, dataDir, defaultSpaceId });
}
