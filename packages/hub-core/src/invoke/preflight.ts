import type { ExecutorPort, ReachabilityResult } from "@murrmure/runtime-contracts";
import type { ResolvedInvoke } from "./types.js";

export interface PreflightResult {
  ok: true;
  reachability: ReachabilityResult;
}

export interface PreflightFailure {
  ok: false;
  error_code: "EXECUTOR_UNAVAILABLE";
  detail?: string;
  queued: boolean;
}

export async function runInvokePreflight(
  port: ExecutorPort,
  resolved: ResolvedInvoke,
  spaceId: string,
): Promise<PreflightResult | PreflightFailure> {
  const reachability = await port.preflight(resolved.binding, { space_id: spaceId });
  if (reachability.status === "reachable") {
    return { ok: true, reachability };
  }

  if (resolved.delivery === "queue_until_executor") {
    return {
      ok: false,
      error_code: "EXECUTOR_UNAVAILABLE",
      detail: reachability.detail,
      queued: true,
    };
  }

  return {
    ok: false,
    error_code: "EXECUTOR_UNAVAILABLE",
    detail: reachability.detail ?? "Executor is not reachable",
    queued: false,
  };
}
