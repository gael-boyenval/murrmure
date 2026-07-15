import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { once } from "node:events";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { serve } from "@hono/node-server";
import { ulid } from "ulid";
import { createRuntimePersistence } from "@murrmure/runtime-persistence";
import { createSqliteStudioPersistence, ensureBootstrapToken, migrateStudio } from "@murrmure/hub-persistence";
import { createHubKernel, HubHandler, createInProcessExecutorPollStore, reconcileHeadlessRuns, startExecutorTimeoutSweep, renderMurrmureProtocolEnvelope, SpaceConcurrencyGuard, cancelAllShellExecutors, awaitAllShellExecutorsTerminated, setResolveCredentialRevoker, revokeAllResolveCredentials } from "@murrmure/hub-core";
import { setMurrmureProtocolRenderer } from "@murrmure/executors";
import type { DaemonConfig, DaemonContext } from "./context.js";
import { createHubApp } from "./routes.js";
import { acquireLock, cleanupStaleStaging, releaseLock, resolveDataDir, updateLockOwnerEndpoint, writeDiscovery } from "./ops.js";
import { McpToolRegistry } from "./mcp-tool-registry.js";
import { ControlBus } from "./control-bus.js";
import { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import { registerPlatformMcpHandlers } from "./mcp-handlers.js";
import { dispatchHooksFromJournal, journalEventToHookSource } from "./hook-dispatch.js";
import { TriggerDispatcher } from "./trigger-dispatcher.js";
import { InvokeService } from "./invoke-service.js";
import { ArtifactService } from "./artifact-service.js";
import { createDaemonFederationPort } from "./federation-wire.js";
import { registerFlowSchedulerCron, matchFlowEventStarts, flowRunDeps } from "./flow-scheduler-cron.js";
import { registerArtifactGcCron } from "./artifact-gc-cron.js";
import { createRunRetentionDeps, registerRunRetentionGc } from "./run-retention-gc.js";
import { createOutOfShellService, wrapHandlerForOutOfShell } from "./out-of-shell-service.js";
import type { EventAppendCommand } from "@murrmure/contracts";
import { UploadIntentService } from "./upload-intent-service.js";

export type { DaemonConfig, DaemonContext } from "./context.js";

function validateShellStaticDir(config: DaemonConfig): void {
  if (!config.shellStaticDir) {
    return;
  }

  const configuredDir = config.shellStaticDir;
  const resolvedDir = resolve(configuredDir);
  let shellStaticStats: ReturnType<typeof statSync>;
  try {
    shellStaticStats = statSync(resolvedDir);
  } catch {
    throw new Error(`Invalid MURRMURE_SHELL_STATIC_DIR: "${configuredDir}" does not exist.`);
  }
  if (!shellStaticStats.isDirectory()) {
    throw new Error(`Invalid MURRMURE_SHELL_STATIC_DIR: "${configuredDir}" is not a directory.`);
  }
  try {
    accessSync(resolvedDir, constants.R_OK);
  } catch {
    throw new Error(`Invalid MURRMURE_SHELL_STATIC_DIR: "${configuredDir}" is not readable.`);
  }

  const indexPath = join(resolvedDir, "index.html");
  let indexStats: ReturnType<typeof statSync>;
  try {
    indexStats = statSync(indexPath);
  } catch {
    throw new Error(
      `Invalid MURRMURE_SHELL_STATIC_DIR: missing readable index.html in "${configuredDir}".`,
    );
  }
  if (!indexStats.isFile()) {
    throw new Error(
      `Invalid MURRMURE_SHELL_STATIC_DIR: "${join(configuredDir, "index.html")}" is not a file.`,
    );
  }
  try {
    accessSync(indexPath, constants.R_OK);
  } catch {
    throw new Error(
      `Invalid MURRMURE_SHELL_STATIC_DIR: "${join(configuredDir, "index.html")}" is not readable.`,
    );
  }

  config.shellStaticDir = resolvedDir;
}

function assertLoopbackListenHost(config: DaemonConfig): void {
  if (!config.shellStaticDir) {
    return;
  }
  const host = config.listenHost ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `Bundled shell mode requires loopback bind; got MURRMURE_LISTEN_HOST=${host}`,
    );
  }
}

function closeServerGracefully(server: ReturnType<typeof serve>): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

async function resolveServerPort(server: ReturnType<typeof serve>, fallbackPort: number): Promise<number> {
  const readPort = (): number | null => {
    const addr = server.address();
    if (typeof addr === "object" && addr) {
      return addr.port;
    }
    return null;
  };

  let boundPort = readPort();
  if ((boundPort === null || boundPort === 0) && fallbackPort === 0 && !server.listening) {
    await once(server, "listening");
    boundPort = readPort();
  }

  return boundPort && boundPort !== 0 ? boundPort : fallbackPort;
}

export async function startHubDaemon(config: DaemonConfig) {
  config.listenHost ??= "127.0.0.1";
  validateShellStaticDir(config);
  assertLoopbackListenHost(config);
  const lockResult = await acquireLock(config, config.port);
  if (lockResult instanceof Response) {
    throw new Error(`Hub already running: ${await lockResult.text()}`);
  }
  cleanupStaleStaging(resolveDataDir(config));

  mkdirSync(dirname(config.databasePath), { recursive: true });
  const kernelPersistence = await createRuntimePersistence(config.databasePath);
  const db = new Database(config.databasePath);
  migrateStudio(db);

  const bootstrapBare = config.bootstrapToken ?? "01JBOOTSTRAPTOKEN00000001";
  ensureBootstrapToken(db, bootstrapBare, "actor_bootstrap", "bootstrap");
  const murrmurePersistence = createSqliteStudioPersistence(db);

  const ids = { ulid: () => ulid() };
  const clock = { nowIso: () => new Date().toISOString() };

  setMurrmureProtocolRenderer((ctx) => renderMurrmureProtocolEnvelope(ctx));
  // Install the revoker used by the assignment-credential registry so terminal
  // paths (resolve, run terminal, shutdown) revoke ephemeral resolve tokens.
  setResolveCredentialRevoker((token_id) => {
    void murrmurePersistence.revokeToken?.(token_id);
  });

  const { kernel } = createHubKernel({ kernelPersistence, murrmurePersistence, ids, clock });
  const handler = new HubHandler(kernel, murrmurePersistence, ids, clock);

  const mcpToolRegistry = new McpToolRegistry(murrmurePersistence);
  const controlBus = new ControlBus();
  const mcpWakeDispatcher = new McpWakeDispatcher(controlBus);
  const triggerDispatcher = new TriggerDispatcher(murrmurePersistence, handler);
  const executorPollStore = createInProcessExecutorPollStore();
  const federationPort = createDaemonFederationPort(murrmurePersistence);
  const spaceRunGuard = new SpaceConcurrencyGuard();
  const uploadIntentService = new UploadIntentService(config.dataDir);
  await uploadIntentService.start();

  const ctx: DaemonContext = {
    handler,
    murrmurePersistence,
    config,
    flows: ["platform"],
    startedAt: new Date(),
    sseSubscribers: new Set(),
    mcpToolRegistry,
    controlBus,
    mcpWakeDispatcher,
    triggerDispatcher,
    executorPollStore,
    federationPort,
    uploadIntentService,
    spaceRunGuard,
    invokeService: undefined as never,
    artifactService: undefined as never,
    outOfShellService: undefined as never,
  };
  ctx.artifactService = new ArtifactService(murrmurePersistence, handler, ctx);
  ctx.invokeService = new InvokeService(
    murrmurePersistence,
    handler,
    controlBus,
    mcpWakeDispatcher,
    ctx,
    ctx.artifactService,
    federationPort,
  );
  ctx.outOfShellService = createOutOfShellService(ctx);
  wrapHandlerForOutOfShell(handler, ctx.outOfShellService);
  triggerDispatcher.invokeService = ctx.invokeService;

  const stopTimeoutSweep = startExecutorTimeoutSweep({
    studio: murrmurePersistence,
    handler,
    ids,
    clock,
    executorPollStore: executorPollStore,
  });

  void reconcileHeadlessRuns({ studio: murrmurePersistence, handler, ids, clock })
    .then((stats) => {
      const total = stats.completed + stats.failed + stats.stale_failed;
      if (total > 0) {
        console.log(
          `[murrmure] reconciled headless runs: completed=${stats.completed} failed=${stats.failed} stale=${stats.stale_failed}`,
        );
      }
    })
    .catch((error) => {
      console.warn("[murrmure] headless run reconcile failed:", error);
    });

  const stopArtifactGc = registerArtifactGcCron(ctx.artifactService);
  const stopRunRetention = registerRunRetentionGc(createRunRetentionDeps(murrmurePersistence), {
    log: (line) => console.log(line),
  });
  const stopFlowScheduler = registerFlowSchedulerCron(
    murrmurePersistence,
    ctx.invokeService,
    () => flowRunDeps(ctx),
    { actor_id: "actor_scheduler", token_id: "tok_scheduler" },
  );

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

      await dispatchHooksFromJournal(ctx, journalEventToHookSource({
        event_id: (result.body?.event_id as string) ?? ulid(),
        event_type: eventCmd.event_type,
        space_id: eventCmd.provenance.space_id,
        payload,
      }), {
        actor_id: eventCmd.provenance.actor_id,
        token_id: eventCmd.provenance.token_id,
      }).catch(() => undefined);

      await matchFlowEventStarts(murrmurePersistence, ctx.invokeService, () => flowRunDeps(ctx), {
        event_type: eventCmd.event_type,
        space_id: eventCmd.provenance.space_id,
        source: `/spaces/${eventCmd.provenance.space_id}`,
        actor_id: eventCmd.provenance.actor_id,
        token_id: eventCmd.provenance.token_id,
      }).catch(() => undefined);
    }
    return result;
  };

  registerPlatformMcpHandlers(mcpToolRegistry, handler, config, murrmurePersistence, ctx);

  const app = createHubApp(ctx);
  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.listenHost });
  const port = await resolveServerPort(server, config.port);
  config.port = port;
  updateLockOwnerEndpoint(config, port);

  writeDiscovery(config, port);

  let shuttingDown: Promise<void> | null = null;
  const shutdown = async () => {
    if (shuttingDown) {
      return shuttingDown;
    }
    shuttingDown = (async () => {
      process.off("SIGINT", handleSigint);
      process.off("SIGTERM", handleSigterm);
      // Terminate every spawned shell handler process tree and revoke all
      // ephemeral resolve credentials so nothing outlives the daemon stop.
      cancelAllShellExecutors();
      revokeAllResolveCredentials();
      stopArtifactGc();
      stopRunRetention();
      stopFlowScheduler();
      stopTimeoutSweep();
      uploadIntentService.stop();
      releaseLock(config);
      await closeServerGracefully(server);
      // Await the SIGKILL escalation so a TERM-resistant descendant is reaped
      // before the daemon process exits; the escalation timers are ref'd so
      // this keeps the event loop alive until every tree is gone.
      await awaitAllShellExecutorsTerminated();
      await kernelPersistence.close();
      db.close();
    })();
    return shuttingDown;
  };

  const handleSigint = () => {
    void shutdown().finally(() => {
      if (!config.embedded) {
        process.exit(0);
      }
    });
  };
  const handleSigterm = () => {
    void shutdown().finally(() => {
      if (!config.embedded) {
        process.exit(0);
      }
    });
  };
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  console.log(`Murrmure hub listening on ${config.listenHost}:${port}`);
  return { handler, server, db, ctx, app, shutdown, port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const databasePath = process.env.DATABASE_PATH ?? "./data/murrmure.db";
  const port = Number(process.env.PORT ?? "8787");
  const dataDir = process.env.MURRMURE_DATA_DIR ?? join(homedir(), ".murrmure");
  const defaultSpaceId = process.env.MURRMURE_SPACE_ID ?? "";
  const shellStaticDir = process.env.MURRMURE_SHELL_STATIC_DIR;
  const embedded = process.env.MURRMURE_EMBEDDED === "1";
  const listenHost = process.env.MURRMURE_LISTEN_HOST ?? "127.0.0.1";
  const bootstrapToken = process.env.MURRMURE_BOOTSTRAP_TOKEN;
  await startHubDaemon({
    databasePath,
    port,
    dataDir,
    defaultSpaceId,
    shellStaticDir,
    embedded,
    listenHost,
    bootstrapToken,
  });
}
