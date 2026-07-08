import type { StepContractCatalogEntry } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { resolveStepParams, resolveStepSpace } from "./templates.js";
import type { FlowStepDispatch } from "./types.js";

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

export interface StepOpenJournal {
  append(input: {
    type: string;
    space_id: string;
    session_id?: string;
    run_id: string;
    step_id: string;
    actor_id: string;
    token_id: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
}

export async function openStepContract(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    entry: StepContractCatalogEntry;
    exec_context: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    journal?: StepOpenJournal;
  },
): Promise<void> {
  const ts = deps.clock.nowIso();
  const runBare = bareRunId(input.run_id);
  const status = input.entry.presentation?.view ? "awaiting_human" : "working";

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.step_id,
    status,
    started_at: ts,
  });

  if (input.journal) {
    await input.journal.append({
      type: JOURNAL_EVENT_TYPES.STEP_OPENED,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      step_id: input.step_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        role: input.entry.role,
        view_id: input.entry.presentation?.view,
      },
    });
  }

  if (input.entry.executor?.action) {
    const space_id = resolveStepSpace(input.entry.executor.space ?? "{{origin_space}}", input.space_id);
    const params = resolveStepParams(input.entry.executor.params, input.exec_context);
    const dispatch: FlowStepDispatch = {
      step_id: input.step_id,
      space_id,
      action_name: input.entry.executor.action,
      params,
    };
    await deps.dispatchSteps({
      dispatch: [dispatch],
      session_id: input.session_id,
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  }

  await deps.studio.updateRunLifecycle(runBare, status === "awaiting_human" ? "input-required" : "working", ts);
}
