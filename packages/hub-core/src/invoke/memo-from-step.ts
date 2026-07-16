import type { RunStepMemo } from "@murrmure/contracts";
import type { DispatchOutcome, DispatchStatus } from "@murrmure/runtime-contracts";

const STEP_TO_DISPATCH: Record<RunStepMemo["status"], DispatchStatus | null> = {
  pending: null,
  working: "dispatched",
  yielded: null,
  completed: "completed",
  failed: "failed",
  skipped: "failed",
};

/** Reconstruct a dispatch outcome from a persisted run step memo (durable idempotency). */
export function dispatchOutcomeFromStepMemo(memo: RunStepMemo): DispatchOutcome | null {
  const status = STEP_TO_DISPATCH[memo.status];
  if (!status) return null;
  return {
    status,
    run_id: memo.run_id,
    step_id: memo.step_id,
    error_code: memo.error_code,
  };
}
