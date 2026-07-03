import type {
  DispatchContext,
  DispatchOutcome,
  ExecutorPort,
  InvokeRequest,
  ReachabilityResult,
} from "@murrmure/runtime-contracts";

const RETRY_BACKOFF_MS = [0, 1000, 3000];

export interface RemoteHubRelayInput {
  remote_hub_id: string;
  remote_space_id: string;
  action_name: string;
  body: Record<string, unknown>;
}

export interface RemoteHubRelayResult {
  ok: boolean;
  http_status: number;
  dispatch?: DispatchOutcome;
  body?: Record<string, unknown>;
}

export interface RemoteHubDeps {
  checkPeerHealth(remote_hub_id: string): Promise<ReachabilityResult>;
  relayInvoke(input: RemoteHubRelayInput): Promise<RemoteHubRelayResult>;
  sleep(ms: number): Promise<void>;
}

export function createRemoteHubExecutor(deps: RemoteHubDeps): ExecutorPort {
  return {
    async preflight(binding, _context): Promise<ReachabilityResult> {
      if (binding.type !== "remote_hub") {
        return { status: "unreachable", detail: "Invalid binding type" };
      }
      return deps.checkPeerHealth(binding.remote_hub_id);
    },

    async dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome> {
      const step_id = invoke.step_id ?? `action:${invoke.action_name}`;
      if (context.binding.type !== "remote_hub") {
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "EXECUTOR_TYPE_UNSUPPORTED",
          detail: "remote_hub adapter received non-remote_hub binding",
        };
      }

      const remote_space_id =
        context.binding.remote_space_id ??
        invoke.space_id;

      const body: Record<string, unknown> = {
        session_id: invoke.session_id,
        run_id: invoke.run_id,
        step_id,
        params: invoke.params ?? {},
        expect: invoke.expect,
        artifacts_in: invoke.artifacts_in,
        delivery: invoke.delivery,
      };

      let lastDetail = "Remote hub unreachable";

      for (let attempt = 0; attempt < RETRY_BACKOFF_MS.length; attempt++) {
        const delay = RETRY_BACKOFF_MS[attempt]!;
        if (delay > 0) {
          await deps.sleep(delay);
        }

        const result = await deps.relayInvoke({
          remote_hub_id: context.binding.remote_hub_id,
          remote_space_id,
          action_name: context.action.name,
          body,
        });

        if (result.ok && result.dispatch) {
          return {
            ...result.dispatch,
            run_id: result.dispatch.run_id ?? invoke.run_id,
            step_id: result.dispatch.step_id ?? step_id,
          };
        }

        lastDetail = result.dispatch?.detail ?? lastDetail;

        const retryable =
          !result.ok &&
          (result.http_status >= 500 || result.http_status === 503 || result.http_status === 0);
        if (!retryable) {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: result.dispatch?.error_code ?? "REMOTE_INVOKE_FAILED",
            detail: lastDetail,
          };
        }
      }

      return {
        status: "executor_unavailable",
        run_id: invoke.run_id,
        step_id,
        error_code: "EXECUTOR_UNAVAILABLE",
        detail: lastDetail,
      };
    },
  };
}
