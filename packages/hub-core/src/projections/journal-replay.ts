import type { RunStepMemo } from "@murrmure/contracts";
import { applyStepMemoFromJournal } from "./step-memo.js";

export interface JournalReplayEvent {
  type: string;
  ts: string;
  payload: Record<string, unknown>;
}

/** Waterfall replay for headless runs — rebuild step memo from journal events. */
export function replayHeadlessSteps(
  run_id: string,
  events: JournalReplayEvent[],
): RunStepMemo[] {
  const byStep = new Map<string, RunStepMemo>();

  for (const event of events) {
    const step_id = String(event.payload.step_id ?? "");
    if (!step_id) continue;

    const current = byStep.get(step_id) ?? null;
    const next = applyStepMemoFromJournal(current, {
      run_id,
      step_id,
      type: event.type,
      ts: event.ts,
      idempotency_key:
        typeof event.payload.idempotency_key === "string"
          ? event.payload.idempotency_key
          : undefined,
      error_code:
        typeof event.payload.error_code === "string" ? event.payload.error_code : undefined,
    });
    if (next) byStep.set(step_id, next);
  }

  return [...byStep.values()].sort((a, b) => a.step_id.localeCompare(b.step_id));
}
