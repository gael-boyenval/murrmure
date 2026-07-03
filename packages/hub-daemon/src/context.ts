import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { HubHandler } from "@murrmure/hub-core";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { McpToolRegistry } from "./mcp-tool-registry.js";
import type { ControlBus } from "./control-bus.js";
import type { McpWakeDispatcher } from "./mcp-wake-dispatcher.js";
import type { TriggerDispatcher } from "./trigger-dispatcher.js";
import type { InvokeService } from "./invoke-service.js";
import type { ArtifactService } from "./artifact-service.js";
import type { ExecutorPollStore } from "@murrmure/hub-core";
import type { OutOfShellService } from "./out-of-shell-service.js";
import type { FederationPort } from "@murrmure/hub-core";

export interface DaemonConfig {
  databasePath: string;
  port: number;
  dataDir: string;
  defaultSpaceId: string;
  bootstrapToken?: string;
  shellStaticDir?: string;
  embedded?: boolean;
  listenHost?: string;
  bundleRoot?: string;
  /** Session cancel cascade cap (default 30s). Tests may set lower. */
  cancelTimeoutMs?: number;
}

export interface DaemonContext {
  handler: HubHandler;
  murrmurePersistence: StudioPersistencePort;
  config: DaemonConfig;
  flows: string[];
  startedAt: Date;
  sseSubscribers: Set<(event: SseOutboundEvent) => void>;
  mcpToolRegistry: McpToolRegistry;
  controlBus: ControlBus;
  mcpWakeDispatcher: McpWakeDispatcher;
  triggerDispatcher: TriggerDispatcher;
  invokeService: InvokeService;
  artifactService: ArtifactService;
  executorPollStore: ExecutorPollStore;
  outOfShellService: OutOfShellService;
  federationPort: FederationPort;
}

export type SseOutboundEvent =
  | { event: "journal.append"; data: Record<string, unknown> }
  | { event: "gate.pending"; data: Record<string, unknown> }
  | { event: "gate.resolved"; data: Record<string, unknown> }
  | { event: "wait.resolved"; data: Record<string, unknown> }
  | { event: "heartbeat"; data: Record<string, unknown> }
  | { event: typeof JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED; data: Record<string, unknown> }
  | { event: "space.list_changed"; data: Record<string, unknown> }
  | { event: "notification.changed"; data: Record<string, unknown> }
  | { event: "out_of_shell.desktop"; data: Record<string, unknown> };

export function broadcastSse(ctx: DaemonContext, evt: SseOutboundEvent): void {
  for (const sub of ctx.sseSubscribers) {
    sub(evt);
  }
}
