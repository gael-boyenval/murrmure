import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createHttpApp } from "./app.js";
import { RuntimeKernel, DeferredWaitRegistry, auditTailHandler } from "@murrmure/runtime-kernel";
import { createRuntimePersistence } from "@murrmure/runtime-persistence";
import type { RuleArtifact } from "@murrmure/runtime-contracts";
import {
  allowAllPolicy,
  compositeNotify,
  fixedClockPort,
  fixedIdPort,
  inMemoryRules,
  permissiveCondition,
  noOpSchema,
  noOpConvergence,
  recordingAction,
} from "./stubs.js";
import { drainOutbox } from "./recovery.js";

export interface DaemonOptions {
  databasePath?: string;
  port?: number;
  rules?: Map<string, RuleArtifact>;
}

/** Thin runtime wiring — merged from @murrmure/runtime-daemon (phase 16). */
export async function startRuntimeDaemon(opts: DaemonOptions = {}) {
  const databasePath = opts.databasePath ?? process.env.DATABASE_PATH ?? "./data/runtime.db";
  const port = opts.port ?? Number(process.env.PORT ?? 8787);

  mkdirSync(dirname(databasePath), { recursive: true });
  const persistence = await createRuntimePersistence(databasePath);
  const waitRegistry = new DeferredWaitRegistry();
  const kernel = new RuntimeKernel({
    persistence,
    policy: allowAllPolicy(),
    rules: inMemoryRules(opts.rules ?? new Map()),
    condition: permissiveCondition(),
    schema: noOpSchema(),
    convergence: noOpConvergence(),
    notify: compositeNotify(waitRegistry),
    action: recordingAction(),
    clock: fixedClockPort(),
    ids: fixedIdPort(),
    waitRegistry,
    projectionHandlers: new Map([["audit_tail", auditTailHandler]]),
  });

  await drainOutbox(persistence, {
    persistence,
    notify: compositeNotify(waitRegistry),
    action: recordingAction(),
    projectionHandlers: new Map([["audit_tail", auditTailHandler]]),
    compoundProgress: new Map(),
    ids: fixedIdPort(),
  });

  const app = createHttpApp({
    commands: kernel,
    queries: kernel,
  });

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`@murrmure/runtime-adapter-http listening on http://localhost:${info.port}`);
  });

  return { kernel, persistence, server, app };
}

/** @deprecated Use startRuntimeDaemon — kept for runtime-daemon package alias. */
export const startDaemon = startRuntimeDaemon;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRuntimeDaemon().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
