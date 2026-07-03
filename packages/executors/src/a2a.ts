import type {
  DispatchContext,
  DispatchOutcome,
  ExecutorPort,
  InvokeRequest,
  ReachabilityResult,
} from "@murrmure/runtime-contracts";

/** Optional A2A HTTP adapter stub — not normative Murrmure wire (slice I). */
export interface A2aDeps {
  postTask(input: {
    endpoint: string;
    action_name: string;
    params: Record<string, unknown>;
  }): Promise<{ ok: boolean; result?: Record<string, unknown>; detail?: string }>;
}

export function createA2aExecutor(deps: A2aDeps): ExecutorPort {
  return {
    async preflight(binding): Promise<ReachabilityResult> {
      if (binding.type !== "a2a") {
        return { status: "unreachable", detail: "Invalid binding type" };
      }
      return { status: "reachable" };
    },

    async dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome> {
      const step_id = invoke.step_id ?? `action:${invoke.action_name}`;
      if (context.binding.type !== "a2a") {
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "EXECUTOR_TYPE_UNSUPPORTED",
          detail: "a2a adapter received non-a2a binding",
        };
      }

      const response = await deps.postTask({
        endpoint: context.binding.endpoint,
        action_name: context.action.name,
        params: invoke.params ?? {},
      });

      if (!response.ok) {
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "A2A_TASK_FAILED",
          detail: response.detail ?? "A2A task endpoint returned failure",
        };
      }

      return {
        status: "completed",
        run_id: invoke.run_id,
        step_id,
        result: response.result ?? {},
      };
    },
  };
}
