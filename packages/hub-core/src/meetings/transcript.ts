import {
  JOURNAL_EVENT_TYPES,
  type Capability,
  type MeetingRosterParticipant,
  type MeetingSnapshotChair,
  type MeetingTranscript,
  type MeetingTranscriptMessage,
  type MeetingTranscriptReceipt,
} from "@murrmure/contracts";
import type { JournalIndexRow, MeetingRosterSeatRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { hasCapability } from "../grants/migrate.js";
import { stripSpaceId } from "../bridge/ids.js";
import { prefixedSpace } from "./roster.js";
import { loadMeeting } from "./snapshot.js";

const MEETING_TYPES = new Set<string>([
  JOURNAL_EVENT_TYPES.MEETING_CONVENED,
  JOURNAL_EVENT_TYPES.MEETING_SAID,
  JOURNAL_EVENT_TYPES.MEETING_DELIVERED,
  JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED,
  JOURNAL_EVENT_TYPES.MEETING_CLOSED,
]);

function prefixedSessionId(session_id: string): string {
  return session_id.startsWith("ses_") ? session_id : `ses_${session_id}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function meetingJournalData(row: JournalIndexRow): Record<string, unknown> {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  const nested = asRecord(payload.data);
  if (
    nested &&
    (nested.message_id != null ||
      nested.roster != null ||
      nested.to != null ||
      nested.participant_id != null ||
      nested.chair != null)
  ) {
    return { ...payload, ...nested };
  }
  return payload;
}

function asSeat(value: unknown): MeetingRosterSeatRow | undefined {
  const rec = asRecord(value);
  if (!rec || typeof rec.participant_id !== "string" || typeof rec.space_id !== "string") {
    return undefined;
  }
  return {
    participant_id: rec.participant_id,
    space_id: prefixedSpace(rec.space_id),
    persona: typeof rec.persona === "string" ? rec.persona : undefined,
  };
}

function rosterFromUnknown(value: unknown): MeetingRosterSeatRow[] {
  if (!Array.isArray(value)) return [];
  return value.map(asSeat).filter((seat): seat is MeetingRosterSeatRow => seat != null);
}

function chairFromUnknown(value: unknown): MeetingSnapshotChair | undefined {
  const rec = asRecord(value);
  if (!rec) return undefined;
  if (rec.human === true) return { human: true };
  if (typeof rec.participant_id === "string") return { participant_id: rec.participant_id };
  return undefined;
}

function toRosterDto(roster: MeetingRosterSeatRow[]): MeetingRosterParticipant[] {
  return roster.map((seat) => ({
    participant_id: seat.participant_id,
    space_id: prefixedSpace(seat.space_id),
    ...(seat.persona ? { persona: seat.persona } : {}),
  }));
}

function projectTo(
  authored: unknown,
  speakerId: string,
  roster: MeetingRosterSeatRow[],
): { all: boolean; participant_ids: string[] } {
  const rec = asRecord(authored);
  const everyoneElse = roster
    .filter((seat) => seat.participant_id !== speakerId)
    .map((seat) => seat.participant_id);
  if (rec?.all === true) {
    return { all: true, participant_ids: everyoneElse };
  }
  const listed = Array.isArray(rec?.participant_ids)
    ? rec.participant_ids.filter((id): id is string => typeof id === "string" && id !== speakerId)
    : [];
  return { all: false, participant_ids: listed };
}

function fromSeat(
  data: Record<string, unknown>,
  roster: MeetingRosterSeatRow[],
): MeetingRosterParticipant {
  const stamped = asRecord(data.from);
  if (stamped && typeof stamped.participant_id === "string" && typeof stamped.space_id === "string") {
    return {
      participant_id: stamped.participant_id,
      space_id: prefixedSpace(stamped.space_id),
      ...(typeof stamped.persona === "string" ? { persona: stamped.persona } : {}),
    };
  }
  const speakerId =
    typeof data.as_participant_id === "string" ? data.as_participant_id : undefined;
  const seat = speakerId ? roster.find((row) => row.participant_id === speakerId) : undefined;
  return {
    participant_id: speakerId ?? "",
    space_id: seat ? prefixedSpace(seat.space_id) : "",
    ...(seat?.persona ? { persona: seat.persona } : {}),
  };
}

export function canReadMeetingTranscript(input: {
  token_space_id: string;
  capabilities: Capability[];
  roster: Array<{ space_id: string }>;
}): boolean {
  if (input.token_space_id === "bootstrap" || hasCapability(input.capabilities, "hub:admin")) {
    return true;
  }
  const tokenBare = stripSpaceId(input.token_space_id);
  const rosterBares = input.roster.map((seat) => stripSpaceId(seat.space_id));
  if (rosterBares.includes(tokenBare)) return true;
  return hasCapability(input.capabilities, "journal:read") && rosterBares.includes(tokenBare);
}

export async function buildMeetingTranscript(
  studio: StudioPersistencePort,
  input: { session_id: string; since_seq?: number },
): Promise<MeetingTranscript | null> {
  const since_seq =
    typeof input.since_seq === "number" && Number.isFinite(input.since_seq) && input.since_seq > 0
      ? Math.floor(input.since_seq)
      : 0;

  const rows = (
    await studio.queryMeetingJournal({
      session_id: input.session_id,
      types: [...MEETING_TYPES],
    })
  ).filter((row) => MEETING_TYPES.has(row.type));

  const snapshot = await loadMeeting(studio, input.session_id);

  let roster: MeetingRosterSeatRow[] = snapshot?.roster ?? [];
  let chair: MeetingSnapshotChair | undefined = snapshot?.chair;
  let status: "open" | "closed" = snapshot?.status ?? "open";

  if (!snapshot) {
    for (const row of rows) {
      const data = meetingJournalData(row);
      if (row.type === JOURNAL_EVENT_TYPES.MEETING_CONVENED) {
        roster = rosterFromUnknown(data.roster);
        chair = chairFromUnknown(data.chair) ?? chair;
        status = "open";
      } else if (row.type === JOURNAL_EVENT_TYPES.MEETING_CLOSED) {
        status = "closed";
      }
    }
  }

  if (!snapshot && roster.length === 0 && !rows.some((row) => row.type === JOURNAL_EVENT_TYPES.MEETING_CONVENED)) {
    return null;
  }
  if (!chair) chair = { human: true };

  const messages = new Map<string, MeetingTranscriptMessage>();
  for (const row of rows) {
    const data = meetingJournalData(row);
    const seq = row.meeting_seq ?? 0;
    if (row.type === JOURNAL_EVENT_TYPES.MEETING_SAID) {
      const message_id = typeof data.message_id === "string" ? data.message_id : "";
      if (!message_id) continue;
      const from = fromSeat(data, roster);
      const artifacts = Array.isArray(data.artifacts)
        ? data.artifacts.filter((id): id is string => typeof id === "string")
        : undefined;
      messages.set(message_id, {
        message_id,
        seq,
        from,
        to: projectTo(data.to, from.participant_id, roster),
        ...(typeof data.in_reply_to === "string" ? { in_reply_to: data.in_reply_to } : {}),
        ...(typeof data.text === "string" ? { text: data.text } : {}),
        ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
        receipts: [],
      });
      continue;
    }

    if (
      row.type !== JOURNAL_EVENT_TYPES.MEETING_DELIVERED &&
      row.type !== JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED
    ) {
      continue;
    }
    const message_id = typeof data.message_id === "string" ? data.message_id : "";
    const participant_id = typeof data.participant_id === "string" ? data.participant_id : "";
    const message = messages.get(message_id);
    if (!message || !participant_id) continue;
    const receipt: MeetingTranscriptReceipt = {
      participant_id,
      status: row.type === JOURNAL_EVENT_TYPES.MEETING_DELIVERED ? "delivered" : "failed",
      ...(row.type === JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED && typeof data.reason === "string"
        ? { reason: data.reason }
        : {}),
    };
    message.receipts.push(receipt);
  }

  const up_to_seq = rows.reduce((max, row) => Math.max(max, row.meeting_seq ?? 0), 0);

  return {
    session_id: prefixedSessionId(input.session_id),
    status,
    roster: toRosterDto(roster),
    chair,
    since_seq,
    up_to_seq,
    messages: [...messages.values()]
      .filter((message) => message.seq > since_seq)
      .sort((a, b) => a.seq - b.seq),
  };
}
