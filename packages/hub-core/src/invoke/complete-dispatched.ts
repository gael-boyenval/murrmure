import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { RunStepMemo } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { DispatchOutcome } from "@murrmure/runtime-contracts";
import { completeAsyncInvoke } from "./completion.js";
import type { InvokeJournalWriter } from "./types.js";

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

export async function completeDispatchedAction(
  studio: StudioPersistencePort,
  journal: InvokeJournalWriter,
  input: {
    run_id: string;
    step_id: string;
    action_name?: string;
    actor_id: string;
    token_id: string;
    space_id: string;
    session_id?: string;
    result?: Record<string, unknown>;
  },
): Promise<
  | { ok: true; outcome: DispatchOutcome; memo: RunStepMemo }
  | { ok: false; code: string; message: string; http: number }
> {
  const runBare = bareRunId(input.run_id);
  const run = await studio.getRun(runBare);
  if (!run) {
    return { ok: false, code: "RUN_NOT_FOUND", message: "Run not found", http: 404 };
  }

  const memos = await studio.listRunStepMemos(`run_${runBare}`);
  const memo = memos.find((m) => m.step_id === input.step_id);
  if (!memo) {
    return {
      ok: false,
      code: "STEP_NOT_FOUND",
      message: `No step memo for '${input.step_id}' on this run`,
      http: 404,
    };
  }

  if (memo.status === "completed") {
    const steps = (run.exec_context.steps ?? {}) as Record<
      string,
      { output?: Record<string, unknown> }
    >;
    const stored = steps[input.step_id]?.output;
    return {
      ok: true,
      outcome: {
        status: "completed",
        run_id: input.run_id,
        step_id: input.step_id,
        result: stored ?? input.result,
      },
      memo,
    };
  }

  if (memo.status !== "working") {
    return {
      ok: false,
      code: "STEP_NOT_IN_PROGRESS",
      message: `Step '${input.step_id}' is '${memo.status}', expected 'working'`,
      http: 409,
    };
  }

  const session_id = input.session_id ?? (run.session_id ? `ses_${run.session_id}` : undefined);
  const outcome = await completeAsyncInvoke(journal, {
    space_id: input.space_id,
    session_id,
    run_id: input.run_id,
    step_id: input.step_id,
    action_name: input.action_name ?? input.step_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    result: input.result,
  });

  const updated =
    (await studio.listRunStepMemos(`run_${runBare}`)).find((m) => m.step_id === input.step_id) ?? memo;

  return { ok: true, outcome, memo: updated };
}

export function isActionCompleteJournalType(type: string): boolean {
  return type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED;
}
