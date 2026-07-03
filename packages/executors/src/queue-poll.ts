import type {
  DispatchContext,
  DispatchOutcome,
  ExecutorPort,
  InvokeRequest,
  ReachabilityResult,
} from "@murrmure/runtime-contracts";

export interface QueuePollEnqueueInput {
  task_id: string;
  executor_id: string;
  invoke: InvokeRequest;
  action_name: string;
  timeout_ms?: number;
}

export interface QueuePollDeps {
  isReachable(executor_id: string): boolean;
  enqueue(input: QueuePollEnqueueInput): void;
  createTaskId(): string;
}

export function createQueuePollExecutor(deps: QueuePollDeps): ExecutorPort {
  return {
    async preflight(binding, _context): Promise<ReachabilityResult> {
      if (binding.type !== "queue_poll") {
        return { status: "unreachable", detail: "Invalid binding type" };
      }
      if (deps.isReachable(binding.executor_id)) {
        return { status: "reachable" };
      }
      return {
        status: "unreachable",
        detail: `No worker poll for executor '${binding.executor_id}' within TTL`,
      };
    },

    async dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome> {
      const step_id = invoke.step_id ?? `action:${invoke.action_name}`;
      if (context.binding.type !== "queue_poll") {
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "EXECUTOR_TYPE_UNSUPPORTED",
          detail: "queue_poll adapter received non-queue_poll binding",
        };
      }

      const executor_id = context.binding.executor_id;
      if (!deps.isReachable(executor_id)) {
        if (invoke.delivery === "queue_until_executor") {
          return {
            status: "queued",
            run_id: invoke.run_id,
            step_id,
            detail: "Waiting for queue_poll worker",
          };
        }
        return {
          status: "executor_unavailable",
          run_id: invoke.run_id,
          step_id,
          error_code: "EXECUTOR_UNAVAILABLE",
          detail: `No worker poll for executor '${executor_id}' within TTL`,
        };
      }

      const task_id = deps.createTaskId();
      deps.enqueue({
        task_id,
        executor_id,
        invoke,
        action_name: context.action.name,
        timeout_ms: context.action.timeout_ms,
      });

      return {
        status: "dispatched",
        run_id: invoke.run_id,
        step_id,
      };
    },
  };
}
