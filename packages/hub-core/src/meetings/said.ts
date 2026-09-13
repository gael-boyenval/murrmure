import { JOURNAL_EVENT_TYPES, MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import type { MeetingRosterSeatRow, MeetingSessionRow } from "@murrmure/hub-persistence";
import { stripSpaceId } from "../bridge/ids.js";
import {
  meetingClosed,
  meetingChairRequired,
  notMeetingMember,
  participantAmbiguous,
  replyUnknown,
  toAmbiguous,
  toEmpty,
  type MeetingDenial,
} from "./errors.js";
import {
  findSeat,
  isHumanChair,
  mintMessageId,
  prefixedSpace,
  rosterSpaceIds,
  seatsForSpace,
} from "./roster.js";
import { loadMeeting } from "./snapshot.js";
import type { MeetingJournalDeps } from "./journal.js";

export type MeetingMessageSpeaker = MeetingRosterSeatRow | { human: true };

export type PreparedSaid = {
  payload: Record<string, unknown>;
  speaker: MeetingMessageSpeaker;
  targets: MeetingRosterSeatRow[];
  message_id: string;
  meeting: MeetingSessionRow;
};

function isMeetingDenial(value: object): value is MeetingDenial {
  return "ok" in value && value.ok === false;
}

function parseTo(
  raw: unknown,
): { kind: "all" } | { kind: "list"; participant_ids: string[] } | MeetingDenial {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return toAmbiguous();
  const rec = raw as { all?: unknown; participant_ids?: unknown };
  const hasAll = rec.all === true;
  const hasList = Array.isArray(rec.participant_ids);
  if (hasAll === hasList) return toAmbiguous();
  if (hasAll) return { kind: "all" };
  const ids = (rec.participant_ids as unknown[]).filter((id): id is string => typeof id === "string");
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return { kind: "list", participant_ids: unique };
}

function resolveSpeaker(
  meeting: MeetingSessionRow,
  emitterSpaceId: string,
  asParticipantId: unknown,
): MeetingRosterSeatRow | MeetingDenial {
  const seats = seatsForSpace(meeting.roster, emitterSpaceId);
  if (typeof asParticipantId === "string" && asParticipantId.length > 0) {
    const seat = findSeat(meeting.roster, asParticipantId);
    if (!seat || stripSpaceId(seat.space_id) !== stripSpaceId(emitterSpaceId)) {
      return notMeetingMember("as_participant_id is not a roster seat in the emitter space");
    }
    return seat;
  }
  if (seats.length === 1) return seats[0]!;
  if (seats.length === 0) return notMeetingMember("Emitter space has no seat in this meeting");
  return participantAmbiguous();
}

function resolveTargets(
  meeting: MeetingSessionRow,
  speaker: MeetingMessageSpeaker,
  to: { kind: "all" } | { kind: "list"; participant_ids: string[] },
): MeetingRosterSeatRow[] | MeetingDenial {
  const speakerId = "participant_id" in speaker ? speaker.participant_id : undefined;
  if (to.kind === "all") {
    const targets = meeting.roster.filter((seat) => seat.participant_id !== speakerId);
    if (targets.length === 0) return emptyTargetsOrDenial(meeting);
    return targets;
  }
  const targets: MeetingRosterSeatRow[] = [];
  for (const id of to.participant_ids) {
    if (id === speakerId) continue;
    const seat = findSeat(meeting.roster, id);
    if (!seat) return notMeetingMember(`Target ${id} is not on the roster`);
    targets.push(seat);
  }
  if (targets.length === 0) return emptyTargetsOrDenial(meeting);
  return targets;
}

function emptyTargetsOrDenial(
  meeting: MeetingSessionRow,
): MeetingRosterSeatRow[] | MeetingDenial {
  if (isHumanChair(meeting.chair)) return [];
  return toEmpty();
}

async function replyExists(
  deps: MeetingJournalDeps,
  session_id: string,
  message_id: string,
): Promise<boolean> {
  const rows = await deps.studio.queryMeetingJournal({
    session_id,
    types: [JOURNAL_EVENT_TYPES.MEETING_SAID],
  });
  return rows.some((row) => {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    const nested =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : undefined;
    return payload.message_id === message_id || nested?.message_id === message_id;
  });
}

async function expandArtifactReaders(
  deps: MeetingJournalDeps,
  meeting: MeetingSessionRow,
  artifacts: unknown,
): Promise<void> {
  if (!Array.isArray(artifacts)) return;
  const readers = rosterSpaceIds(meeting.roster);
  const session = await deps.studio.getSession(meeting.session_id);
  if (session?.actor_id) readers.push(`actor:${session.actor_id}`);
  for (const id of artifacts) {
    if (typeof id !== "string") continue;
    await deps.studio.updateArtifactAuthorizedReaders(id, readers);
  }
}

export async function prepareMeetingSaid(
  deps: MeetingJournalDeps & { ids: { ulid: () => string } },
  input: {
    space_id: string;
    session_id: string;
    payload: Record<string, unknown>;
    actor_id?: string;
    human_chair?: boolean;
    bootstrap?: boolean;
  },
): Promise<{ ok: true; prepared: PreparedSaid } | MeetingDenial | { ok: true; legacy: true; payload: Record<string, unknown> }> {
  const meeting = await loadMeeting(deps.studio, input.session_id);
  if (!meeting) {
    return { ok: true, legacy: true, payload: input.payload };
  }
  if (meeting.status === "closed") return meetingClosed();

  const to = parseTo(input.payload.to);
  if (isMeetingDenial(to)) return to;

  let speaker: MeetingMessageSpeaker | MeetingDenial;
  if (input.human_chair) {
    const session = await deps.studio.getSession(input.session_id);
    if (
      !isHumanChair(meeting.chair) ||
      (!input.bootstrap && (!input.actor_id || session?.actor_id !== input.actor_id))
    ) {
      return meetingChairRequired();
    }
    speaker = { human: true };
  } else {
    speaker = resolveSpeaker(meeting, input.space_id, input.payload.as_participant_id);
  }
  if (isMeetingDenial(speaker)) return speaker;

  const targets = resolveTargets(meeting, speaker, to);
  if (isMeetingDenial(targets)) return targets;

  const inReplyTo = input.payload.in_reply_to;
  if (typeof inReplyTo === "string" && inReplyTo.length > 0) {
    if (!(await replyExists(deps, input.session_id, inReplyTo))) {
      return replyUnknown(inReplyTo);
    }
  }

  const hasText = typeof input.payload.text === "string" && input.payload.text.length > 0;
  const hasArtifacts = Array.isArray(input.payload.artifacts) && input.payload.artifacts.length > 0;
  if (!hasText && !hasArtifacts) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.CONTRACT_VALIDATION_DENIED,
      message: "said requires text or artifacts",
      http: 400,
    };
  }

  await expandArtifactReaders(deps, meeting, input.payload.artifacts);

  const message_id = mintMessageId(deps.ids.ulid);
  const from =
    "human" in speaker
      ? { human: true as const }
      : {
          participant_id: speaker.participant_id,
          space_id: prefixedSpace(speaker.space_id),
          ...(speaker.persona ? { persona: speaker.persona } : {}),
        };
  const { as_participant_id: _asParticipantId, ...rest } = input.payload;
  const payload = {
    ...rest,
    ...("participant_id" in speaker
      ? { as_participant_id: speaker.participant_id }
      : {}),
    message_id,
    from,
  };

  return {
    ok: true,
    prepared: {
      payload,
      speaker,
      targets,
      message_id,
      meeting,
    },
  };
}
