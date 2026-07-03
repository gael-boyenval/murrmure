import type { RunLifecycle, RunStepMemo } from "@murrmure/contracts";
import { isRunTerminal } from "../session/status.js";

export function allSiblingsTerminal(lifecycles: RunLifecycle[]): boolean {
  return lifecycles.length > 0 && lifecycles.every((l) => isRunTerminal(l));
}

export function parallelStepReadyToJoin(
  parallelMemo: RunStepMemo | undefined,
  siblingLifecycles: RunLifecycle[],
): boolean {
  if (!parallelMemo || parallelMemo.status === "pending") {
    return allSiblingsTerminal(siblingLifecycles);
  }
  return parallelMemo.status === "completed";
}

export function joinParallelStepStatus(siblingLifecycles: RunLifecycle[]): "completed" | "failed" {
  if (siblingLifecycles.every((l) => l === "completed")) return "completed";
  if (siblingLifecycles.some((l) => l === "completed")) return "failed";
  return "failed";
}
