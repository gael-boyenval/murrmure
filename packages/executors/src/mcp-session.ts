import type {
  DispatchContext,
  DispatchOutcome,
  ExecutorPort,
  InvokeRequest,
  ReachabilityResult,
} from "@murrmure/runtime-contracts";

export interface McpSessionControlMessage {
  method: string;
  params: Record<string, unknown>;
}

export interface McpSessionDeps {
  isReachable(spaceId: string): boolean;
  publish(spaceId: string, message: McpSessionControlMessage): void;
}

export function createMcpSessionExecutor(deps: McpSessionDeps): ExecutorPort {
  return {
    async preflight(_binding, context): Promise<ReachabilityResult> {
      if (!deps.isReachable(context.space_id)) {
        return { status: "unreachable", detail: "No MCP session connected for space" };
      }
      return { status: "reachable" };
    },

    async dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome> {
      const step_id = invoke.step_id ?? `action:${invoke.action_name}`;
      const spaceId = invoke.space_id;

      if (!deps.isReachable(spaceId)) {
        if (invoke.delivery === "queue_until_executor") {
          return {
            status: "queued",
            run_id: invoke.run_id,
            step_id,
            detail: "Waiting for MCP session",
          };
        }
        return {
          status: "executor_unavailable",
          run_id: invoke.run_id,
          step_id,
          error_code: "EXECUTOR_UNAVAILABLE",
          detail: "No MCP session connected for space",
        };
      }

      deps.publish(spaceId, {
        method: "murrmure/control.invoke_action",
        params: {
          action_name: invoke.action_name,
          step_id,
          run_id: invoke.run_id,
          session_id: invoke.session_id,
          params: invoke.params ?? {},
          expect: invoke.expect,
          artifacts_in: invoke.artifacts_in,
          executor_id: context.binding.executor_id,
        },
      });

      return {
        status: "dispatched",
        run_id: invoke.run_id,
        step_id,
      };
    },
  };
}
