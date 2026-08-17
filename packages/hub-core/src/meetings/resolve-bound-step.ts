import type { MeetingSessionRow } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import type { StepResolveDeps, StepResolveJournal } from "../flow-engine/step-resolve.js";
import { resolveFlowStep } from "../flow-engine/step-resolve.js";
import type { SessionRunDeps } from "../run/service.js";

export type ResolveBoundMeetingDeps = SessionRunDeps & {
  dispatchSteps?: StepResolveDeps["dispatchSteps"];
};

function journalFromHandler(deps: SessionRunDeps): StepResolveJournal {
  return {
    append: async (entry) => {
      await deps.handler.appendSpaceJournal({
        type: entry.type,
        space_id: entry.space_id,
        session_id: entry.session_id,
        run_id: entry.run_id,
        step_id: entry.step_id,
        actor_id: entry.actor_id,
        token_id: entry.token_id,
        data: entry.data,
      });
    },
  };
}

/**
 * Engine close → resolve. Headless rooms (no bound run/step) skip.
 * `data.failed: true` resolves `failed`; otherwise `completed`.
 */
export async function maybeResolveBoundMeetingStep(
  deps: ResolveBoundMeetingDeps,
  input: {
    meeting: MeetingSessionRow;
    failed?: boolean;
    actor_id: string;
    token_id: string;
    space_id: string;
    session_id: string;
  },
): Promise<void> {
  const run_id = input.meeting.bound_run_id;
  const step_id = input.meeting.bound_step_id;
  if (!run_id || !step_id) return;

  const resolveDeps: StepResolveDeps = {
    studio: deps.studio,
    handler: deps.handler,
    ids: deps.ids,
    clock: deps.clock,
    cancelTimeoutMs: deps.cancelTimeoutMs,
    executorPollStore: deps.executorPollStore,
    guard: deps.guard,
    dispatchSteps: deps.dispatchSteps ?? (async () => undefined),
  };

  await resolveFlowStep(resolveDeps, {
    run_id,
    step_id,
    body: { branch: input.failed === true ? "failed" : "completed", payload: {} },
    actor_id: input.actor_id,
    token_id: input.token_id,
    space_id: addSpaceId(stripSpaceId(input.space_id)),
    session_id: input.session_id,
    journal: journalFromHandler(deps),
  });
}
