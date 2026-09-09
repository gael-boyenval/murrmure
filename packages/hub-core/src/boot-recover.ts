import { JOURNAL_EVENT_TYPES, type Capability } from "@murrmure/contracts";
import type { HookDispatchDeps } from "./hooks/dispatch.js";
import { dispatchMeetingConveneTargets } from "./meetings/dispatch.js";
import { prefixedSpace } from "./meetings/roster.js";
import { failRunWithNotification, type SessionRunDeps } from "./run/service.js";

export const HUB_RESTART_ORPHANED = "HUB_RESTART_ORPHANED";

export type BootRecoverActor = {
  actor_id: string;
  token_id: string;
  capabilities?: Capability[];
};

function bareSession(id: string): string {
  return id.startsWith("ses_") ? id.slice(4) : id;
}

function bareRun(id: string): string {
  return id.startsWith("run_") ? id.slice(4) : id;
}

function canDispatchSeats(deps: SessionRunDeps): deps is HookDispatchDeps {
  return "invokeAction" in deps && typeof (deps as HookDispatchDeps).invokeAction === "function";
}

/**
 * After Hub replace, in-memory executors are gone. Fail leftover `working`
 * runs so Retry / apply quiescence work. Skip `input-required` (human wait)
 * and the flow run bound to an open meeting (the room is still the work).
 * Meeting seat runs fail silently — boot rehydrate respawns them.
 */
export async function failOrphanedWorkingRuns(
  deps: SessionRunDeps,
  input: BootRecoverActor,
): Promise<{ failed: number; skipped_bound: number }> {
  const meetings = await deps.studio.listOpenMeetings();
  const boundRuns = new Set(
    meetings.map((row) => row.bound_run_id).filter((id): id is string => Boolean(id)).map(bareRun),
  );
  const openMeetingSessions = new Set(meetings.map((row) => bareSession(row.session_id)));

  const runs = await deps.studio.listRuns({
    lifecycles: ["working"],
    limit: 500,
  });

  let failed = 0;
  let skipped_bound = 0;
  for (const run of runs) {
    if (boundRuns.has(bareRun(run.run_id))) {
      skipped_bound += 1;
      continue;
    }
    const meetingSeat = openMeetingSessions.has(bareSession(run.session_id));
    await failRunWithNotification(deps, {
      run_id: run.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: HUB_RESTART_ORPHANED,
      notify: !meetingSeat,
    });
    failed += 1;
  }
  return { failed, skipped_bound };
}

/**
 * Silent seat respawn for rooms that stayed `open` across Hub death.
 * Does not journal `mrmr.meeting.resumed` (that event is the human Resume path).
 * Continuation tokens on disk make the next process `--resume` the same chat.
 */
export async function rehydrateOpenMeetings(
  deps: SessionRunDeps,
  input: BootRecoverActor,
): Promise<{ rooms: number }> {
  if (!canDispatchSeats(deps)) return { rooms: 0 };

  const meetings = await deps.studio.listOpenMeetings();
  let rooms = 0;
  for (const meeting of meetings) {
    const spaceId = prefixedSpace(meeting.roster[0]?.space_id ?? "hub");
    await dispatchMeetingConveneTargets(deps, {
      session_id: meeting.session_id,
      event_id: deps.ids.ulid(),
      event_type: JOURNAL_EVENT_TYPES.MEETING_RESUMED,
      convenor_space_id: spaceId,
      title: meeting.title ?? "Meeting",
      goal: meeting.goal,
      roster: meeting.roster,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? ["hub:admin", "flow:run"],
    });
    rooms += 1;
  }
  return { rooms };
}
