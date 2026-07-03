import type { RunLifecycle } from "@murrmure/contracts";
import { isRunTerminal } from "../session/status.js";

/** Map v1 instance aggregate state to rev-1 run lifecycle. */
export function instanceStateToLifecycle(state: string): RunLifecycle {
  const normalized = state.toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (
    normalized.includes("input") ||
    normalized.includes("pending") ||
    normalized.includes("gate") ||
    normalized.includes("wait")
  ) {
    return "input-required";
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("resolved") ||
    normalized.includes("done") ||
    normalized.includes("converged")
  ) {
    return "completed";
  }
  return "working";
}

export function assertRunNotTerminal(lifecycle: RunLifecycle): { ok: true } | { ok: false; code: string } {
  if (isRunTerminal(lifecycle)) {
    return { ok: false, code: "RUN_TERMINAL" };
  }
  return { ok: true };
}

export function runIdToInstanceId(run_id: string): string {
  const bare = run_id.startsWith("run_") ? run_id.slice(4) : run_id;
  return `ins_${bare}`;
}

export function instanceIdToRunBare(instance_id: string): string {
  if (instance_id.startsWith("ins_")) return instance_id.slice(4);
  if (instance_id.startsWith("run_")) return instance_id.slice(4);
  return instance_id;
}
