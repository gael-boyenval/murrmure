import { JOURNAL_EVENT_TYPES, type MeetingClosedData } from "@murrmure/contracts";
import type { MeetingSessionRow } from "@murrmure/hub-persistence";
import { stripSpaceId } from "../bridge/ids.js";
import type { LiveAssignmentPort } from "../hooks/dispatch.js";
import { meetingChairRequired, meetingClosed, sessionNotFound, type MeetingDenial } from "./errors.js";
import { appendMeetingEvent, type MeetingJournalDeps } from "./journal.js";
import { maybeResolveBoundMeetingStep, type ResolveBoundMeetingDeps } from "./resolve-bound-step.js";
import { chairParticipantId, findSeat, isHumanChair, prefixedSpace } from "./roster.js";
import { loadMeeting, writeMeetingSnapshot } from "./snapshot.js";

export type CloseMeetingInput = MeetingClosedData & {
  session_id: string;
  actor_id: string;
  token_id: string;
  convenor_space_id?: string;
  /** HTTP / human path — session actor or bootstrap. */
  human?: boolean;
  bootstrap?: boolean;
  /** Emit path — speaker seat in the token space. */
  as_participant_id?: string;
  emitter_space_id?: string;
};

export type CloseMeetingResult =
  | {
      ok: true;
      session_id: string;
      status: "closed";
      outcome: "completed" | "failed";
      close_meeting_seq: number;
    }
  | MeetingDenial;

function closeOutcome(data: MeetingClosedData): "completed" | "failed" {
  return data.failed === true ? "failed" : "completed";
}

export function assertChairMayClose(
  meeting: MeetingSessionRow,
  input: {
    human?: boolean;
    bootstrap?: boolean;
    actor_id: string;
    session_actor_id?: string;
    as_participant_id?: string;
    emitter_space_id?: string;
  },
): MeetingDenial | null {
  if (isHumanChair(meeting.chair)) {
    if (input.bootstrap) return null;
    if (input.human && input.session_actor_id && input.actor_id === input.session_actor_id) {
      return null;
    }
    return meetingChairRequired();
  }

  const chairId = chairParticipantId(meeting.chair);
  if (!chairId) return meetingChairRequired();

  if (input.human && !input.bootstrap) return meetingChairRequired();

  const chairSeat = findSeat(meeting.roster, chairId);
  if (!chairSeat) return meetingChairRequired();

  if (input.as_participant_id && input.as_participant_id !== chairId) {
    return meetingChairRequired();
  }
  if (input.emitter_space_id && stripSpaceId(chairSeat.space_id) !== stripSpaceId(input.emitter_space_id)) {
    return meetingChairRequired();
  }
  if (!input.as_participant_id && !input.emitter_space_id && !input.bootstrap) {
    return meetingChairRequired();
  }
  return null;
}

export async function persistClosedSnapshot(
  deps: MeetingJournalDeps & { clock: { nowIso: () => string } },
  input: {
    meeting: MeetingSessionRow;
    entry_id: string;
    meeting_seq: number;
    failed?: boolean;
  },
): Promise<void> {
  await writeMeetingSnapshot(deps.studio, {
    ...input.meeting,
    status: "closed",
    close_entry_id: input.entry_id,
    close_meeting_seq: input.meeting_seq,
    close_outcome: input.failed === true ? "failed" : "completed",
    updated_at: deps.clock.nowIso(),
  });
}

export async function prepareMeetingClosed(
  deps: MeetingJournalDeps,
  input: {
    session_id: string;
    actor_id: string;
    space_id: string;
    payload: Record<string, unknown>;
  },
): Promise<{ ok: true; meeting: MeetingSessionRow; payload: Record<string, unknown> } | MeetingDenial> {
  const meeting = await loadMeeting(deps.studio, input.session_id);
  if (!meeting) return meetingClosed();
  if (meeting.status === "closed") return meetingClosed();
  const denied = assertChairMayClose(meeting, {
    actor_id: input.actor_id,
    as_participant_id: typeof input.payload.as_participant_id === "string"
      ? input.payload.as_participant_id
      : undefined,
    emitter_space_id: input.space_id,
  });
  if (denied) return denied;
  return { ok: true, meeting, payload: input.payload };
}

export async function closeMeeting(
  deps: MeetingJournalDeps & {
    clock: { nowIso: () => string };
    liveAssignments?: LiveAssignmentPort;
    dispatchSteps?: ResolveBoundMeetingDeps["dispatchSteps"];
  },
  input: CloseMeetingInput,
): Promise<CloseMeetingResult> {
  const meeting = await loadMeeting(deps.studio, input.session_id);
  if (!meeting) return meetingClosed();
  if (meeting.status === "closed") return meetingClosed();

  const session = await deps.studio.getSession(input.session_id);
  if (!session && !input.bootstrap) return sessionNotFound();

  const denied = assertChairMayClose(meeting, {
    human: input.human,
    bootstrap: input.bootstrap,
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
  const data = {
    reason: input.reason,
    outcome: input.outcome,
    artifacts: input.artifacts,
    ...(input.failed === true ? { failed: true } : {}),
  };
  const journaled = await appendMeetingEvent(deps, {
    space_id: spaceId,
    type: JOURNAL_EVENT_TYPES.MEETING_CLOSED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: input.session_id,
    data,
  });
  await persistClosedSnapshot(deps, {
    meeting,
    entry_id: journaled.entry_id,
    meeting_seq: journaled.meeting_seq,
    failed: input.failed,
  });

  const prefixed = input.session_id.startsWith("ses_") ? input.session_id : `ses_${input.session_id}`;
  await deps.liveAssignments?.revoke({ session_id: prefixed });
  await maybeResolveBoundMeetingStep(deps, {
    meeting,
    failed: input.failed,
    actor_id: input.actor_id,
    token_id: input.token_id,
    space_id: spaceId,
    session_id: prefixed,
  });
  return {
    ok: true,
    session_id: prefixed,
    status: "closed",
    outcome: closeOutcome(input),
    close_meeting_seq: journaled.meeting_seq,
  };
}
