import { JOURNAL_EVENT_TYPES, type Capability } from "@murrmure/contracts";
import type { MeetingSessionRow } from "@murrmure/hub-persistence";
import type { HookDispatchDeps, LiveAssignmentPort } from "../hooks/dispatch.js";
import { meetingAlreadyOpen, meetingClosed, sessionNotFound, type MeetingDenial } from "./errors.js";
import { dispatchMeetingConveneTargets } from "./dispatch.js";
import { appendMeetingEvent, type MeetingJournalDeps } from "./journal.js";
import { assertChairMayClose } from "./close.js";
import { prefixedSpace } from "./roster.js";
import { loadMeeting, writeMeetingSnapshot } from "./snapshot.js";

export type ResumeMeetingInput = {
  session_id: string;
  actor_id: string;
  token_id: string;
  convenor_space_id?: string;
  human?: boolean;
  bootstrap?: boolean;
  operator?: boolean;
  convenor?: boolean;
  as_participant_id?: string;
  emitter_space_id?: string;
  capabilities?: Capability[];
};

export type ResumeMeetingResult =
  | {
      ok: true;
      session_id: string;
      status: "open";
      resume_meeting_seq: number;
      roster: MeetingSessionRow["roster"];
    }
  | MeetingDenial;

export async function resumeMeeting(
  deps: MeetingJournalDeps & {
    clock: { nowIso: () => string };
    liveAssignments?: LiveAssignmentPort;
  },
  input: ResumeMeetingInput,
): Promise<ResumeMeetingResult> {
  const meeting = await loadMeeting(deps.studio, input.session_id);
  if (!meeting) return meetingClosed();
  if (meeting.status === "open") return meetingAlreadyOpen();

  const session = await deps.studio.getSession(input.session_id);
  if (!session && !input.bootstrap) return sessionNotFound();

  const denied = assertChairMayClose(meeting, {
    human: input.human,
    bootstrap: input.bootstrap,
    operator: input.operator,
    convenor: input.convenor,
    actor_id: input.actor_id,
    session_actor_id: session?.actor_id,
    as_participant_id: input.as_participant_id,
    emitter_space_id: input.emitter_space_id,
  });
  if (denied) return denied;

  const spaceId = prefixedSpace(
    input.convenor_space_id ??
      input.emitter_space_id ??
      meeting.roster[0]?.space_id ??
      "hub",
  );
  const journaled = await appendMeetingEvent(deps, {
    space_id: spaceId,
    type: JOURNAL_EVENT_TYPES.MEETING_RESUMED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: input.session_id,
    data: {
      roster: meeting.roster,
      chair: meeting.chair,
    },
  });

  const written = await writeMeetingSnapshot(deps.studio, {
    ...meeting,
    status: "open",
    updated_at: deps.clock.nowIso(),
  });
  if (!written.ok) return written;

  const prefixed = input.session_id.startsWith("ses_") ? input.session_id : `ses_${input.session_id}`;
  if (canDispatchSeats(deps)) {
    await dispatchMeetingConveneTargets(deps, {
      session_id: prefixed,
      event_id: journaled.entry_id,
      event_type: JOURNAL_EVENT_TYPES.MEETING_RESUMED,
      convenor_space_id: spaceId,
      title: meeting.title ?? "Meeting",
      goal: meeting.goal,
      roster: meeting.roster,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? [],
    });
  }

  return {
    ok: true,
    session_id: prefixed,
    status: "open",
    resume_meeting_seq: journaled.meeting_seq,
    roster: meeting.roster,
  };
}

function canDispatchSeats(deps: MeetingJournalDeps): deps is HookDispatchDeps {
  return "invokeAction" in deps && typeof (deps as HookDispatchDeps).invokeAction === "function";
}
