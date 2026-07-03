import type { RunLifecycle, SessionStatus } from "@murrmure/contracts";

const TERMINAL: RunLifecycle[] = ["completed", "failed", "cancelled"];
const ACTIVE: RunLifecycle[] = ["working", "input-required"];

/** rev-1 §3.4 — derive session status from child run lifecycles. */
export function deriveSessionStatus(
  runLifecycles: RunLifecycle[],
  cancelRequested?: boolean,
): SessionStatus {
  if (cancelRequested && runLifecycles.every((l) => TERMINAL.includes(l))) {
    return "cancelled";
  }
  if (runLifecycles.length === 0) {
    return cancelRequested ? "cancelled" : "active";
  }
  if (runLifecycles.some((l) => ACTIVE.includes(l))) {
    return "active";
  }
  if (runLifecycles.every((l) => l === "completed")) {
    return "completed";
  }
  if (runLifecycles.every((l) => l === "failed" || l === "cancelled")) {
    const allCancelled = runLifecycles.every((l) => l === "cancelled");
    return allCancelled ? "cancelled" : "failed";
  }
  if (runLifecycles.every((l) => TERMINAL.includes(l))) {
    return "partial_failure";
  }
  return "active";
}

export function isRunTerminal(lifecycle: RunLifecycle): boolean {
  return TERMINAL.includes(lifecycle);
}
