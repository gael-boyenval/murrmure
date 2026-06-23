import type { HubHandler } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { MountRegistry } from "./mount-registry.js";
import type { McpToolRegistry } from "./mcp-tool-registry.js";
import type { ControlBus } from "./control-bus.js";
import type { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import type { TriggerDispatcher } from "./trigger-dispatcher.js";
import type { CapabilityWorkerPool } from "./capability-worker-pool.js";

export interface DaemonConfig {
  databasePath: string;
  port: number;
  dataDir: string;
  defaultSpaceId: string;
  bootstrapToken?: string;
}

export interface DaemonContext {
  handler: HubHandler;
  studioPersistence: StudioPersistencePort;
  config: DaemonConfig;
  capabilities: string[];
  startedAt: Date;
  sseSubscribers: Set<(event: SseOutboundEvent) => void>;
  mountRegistry: MountRegistry;
  mcpToolRegistry: McpToolRegistry;
  controlBus: ControlBus;
  mcpWakeDispatcher: McpWakeDispatcher;
  triggerDispatcher: TriggerDispatcher;
  workerPool: CapabilityWorkerPool;
}

export type SseOutboundEvent =
  | { event: "journal.append"; data: Record<string, unknown> }
  | { event: "gate.pending"; data: Record<string, unknown> }
  | { event: "gate.resolved"; data: Record<string, unknown> }
  | { event: "wait.resolved"; data: Record<string, unknown> }
  | { event: "heartbeat"; data: Record<string, unknown> }
  | { event: "capability.dev_reload"; data: Record<string, unknown> }
  | { event: "capability.live_applied"; data: Record<string, unknown> };

export function broadcastSse(ctx: DaemonContext, evt: SseOutboundEvent): void {
  for (const sub of ctx.sseSubscribers) {
    sub(evt);
  }
}
