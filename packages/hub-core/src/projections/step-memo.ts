import type { RunStepMemo, RunStepStatus } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

export function stepStatusFromJournalType(type: string): RunStepStatus | null {
  switch (type) {
    case JOURNAL_EVENT_TYPES.ACTION_DISPATCHED:
      return "working";
    case JOURNAL_EVENT_TYPES.ACTION_COMPLETED:
      return "completed";
    case JOURNAL_EVENT_TYPES.ACTION_FAILED:
    case JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT:
    case JOURNAL_EVENT_TYPES.ACTION_EXECUTOR_UNAVAILABLE:
      return "failed";
    default:
      return null;
  }
}

export function applyStepMemoFromJournal(
  current: RunStepMemo | null,
  input: {
    run_id: string;
    step_id: string;
    type: string;
    ts: string;
    idempotency_key?: string;
    result_hash?: string;
    error_code?: string;
    executor_type?: string;
  },
): RunStepMemo | null {
  const nextStatus = stepStatusFromJournalType(input.type);
  if (!nextStatus) return current;

  const base: RunStepMemo = current ?? {
    run_id: input.run_id,
    step_id: input.step_id,
    status: "pending",
  };

  const memo: RunStepMemo = {
    ...base,
    status: nextStatus,
    idempotency_key: input.idempotency_key ?? base.idempotency_key,
    result_hash: input.result_hash ?? base.result_hash,
    error_code: input.error_code ?? base.error_code,
    executor_type: input.executor_type ?? base.executor_type,
    started_at: base.started_at ?? (nextStatus === "working" ? input.ts : base.started_at),
    completed_at:
      nextStatus === "completed" || nextStatus === "failed" ? input.ts : base.completed_at,
  };

  if (nextStatus === "working" && !memo.started_at) {
    memo.started_at = input.ts;
  }

  return memo;
}
