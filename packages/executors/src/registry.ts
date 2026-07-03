import type { ExecutorBinding, ExecutorPort } from "@murrmure/runtime-contracts";
import { createA2aExecutor, type A2aDeps } from "./a2a.js";
import { createMcpSessionExecutor, type McpSessionDeps } from "./mcp-session.js";
import { createQueuePollExecutor, type QueuePollDeps } from "./queue-poll.js";
import { createRemoteHubExecutor, type RemoteHubDeps } from "./remote-hub.js";
import { createShellSpawnExecutor, type ShellSpawnDeps } from "./shell-spawn.js";

export interface ExecutorRegistryDeps {
  mcpSession: McpSessionDeps;
  shellSpawn?: ShellSpawnDeps;
  queuePoll?: QueuePollDeps;
  remoteHub?: RemoteHubDeps;
  a2a?: A2aDeps;
}

export interface ExecutorRegistry {
  getPort(binding: ExecutorBinding): ExecutorPort | null;
}

export function createExecutorRegistry(deps: ExecutorRegistryDeps): ExecutorRegistry {
  const shell = createShellSpawnExecutor(deps.shellSpawn);
  const mcp = createMcpSessionExecutor(deps.mcpSession);
  const queuePoll = deps.queuePoll ? createQueuePollExecutor(deps.queuePoll) : null;
  const remoteHub = deps.remoteHub ? createRemoteHubExecutor(deps.remoteHub) : null;
  const a2a = deps.a2a ? createA2aExecutor(deps.a2a) : null;

  const byType: Record<string, ExecutorPort> = {
    shell_spawn: shell,
    mcp_session: mcp,
    ...(queuePoll ? { queue_poll: queuePoll } : {}),
    ...(remoteHub ? { remote_hub: remoteHub } : {}),
    ...(a2a ? { a2a } : {}),
  };

  return {
    getPort(binding: ExecutorBinding): ExecutorPort | null {
      return byType[binding.type] ?? null;
    },
  };
}

export { createShellSpawnExecutor, createMcpSessionExecutor, createQueuePollExecutor, createRemoteHubExecutor, createA2aExecutor };
export type { McpSessionDeps, ShellSpawnDeps, QueuePollDeps, RemoteHubDeps, A2aDeps };
