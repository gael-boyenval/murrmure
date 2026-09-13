import {
  JOURNAL_EVENT_TYPES,
  type Capability,
  type MeetingRosterParticipant,
  type MeetingSnapshotChair,
  type MeetingTranscriptSender,
  type MeetingTranscript,
  type MeetingTranscriptMessage,
  type MeetingTranscriptReceipt,
  type MeetingTranscriptYou,
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
  JOURNAL_EVENT_TYPES.MEETING_RESUMED,
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

export function meetingSpeakerLabel(from: {
  human?: boolean;
  persona?: string;
  space_id?: string;
  participant_id?: string;
}): string {
  if (from.human === true) return "human chair";
  const persona = from.persona?.trim();
  const space = from.space_id?.trim();
  if (persona && space) return `${persona}@${space}`;
  if (persona) return persona;
  if (from.participant_id) return from.participant_id;
  return "seat";
}

function withSenderLabel(from: MeetingTranscriptSender): MeetingTranscriptSender {
  return { ...from, label: meetingSpeakerLabel(from) };
}

export function resolveTranscriptReader(
  roster: MeetingRosterParticipant[],
  input: {
    participant_id?: string;
    token_space_id?: string;
    capabilities?: Capability[];
  },
): MeetingTranscriptYou | undefined {
  const participant_id = input.participant_id?.trim();
  if (!participant_id) return undefined;
  const seat = roster.find((row) => row.participant_id === participant_id);
  if (!seat) return undefined;
  const token = input.token_space_id?.trim();
  const admin =
    !token ||
    token === "bootstrap" ||
    hasCapability(input.capabilities ?? [], "hub:admin");
  if (!admin && token && stripSpaceId(seat.space_id) !== stripSpaceId(token)) {
    return undefined;
  }
  return { ...seat, label: meetingSpeakerLabel(seat) };
}

function addressedToReader(
  message: MeetingTranscriptMessage,
  reader_id: string,
): boolean {
  if ("participant_id" in message.from && message.from.participant_id === reader_id) {
    return false;
  }
  return message.to.participant_ids.includes(reader_id);
}

function fromSeat(
  data: Record<string, unknown>,
  roster: MeetingRosterSeatRow[],
): MeetingTranscriptSender {
  const stamped = asRecord(data.from);
  if (stamped?.human === true) return withSenderLabel({ human: true });
  if (stamped && typeof stamped.participant_id === "string" && typeof stamped.space_id === "string") {
    return withSenderLabel({
      participant_id: stamped.participant_id,
      space_id: prefixedSpace(stamped.space_id),
      ...(typeof stamped.persona === "string" ? { persona: stamped.persona } : {}),
    });
  }
  const speakerId =
    typeof data.as_participant_id === "string" ? data.as_participant_id : undefined;
  const seat = speakerId ? roster.find((row) => row.participant_id === speakerId) : undefined;
  return withSenderLabel({
    participant_id: speakerId ?? "",
    space_id: seat ? prefixedSpace(seat.space_id) : "",
    ...(seat?.persona ? { persona: seat.persona } : {}),
  });
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
  input: {
    session_id: string;
    since_seq?: number;
    reader_participant_id?: string;
    token_space_id?: string;
    capabilities?: Capability[];
  },
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
  let goal = snapshot?.goal?.trim() || undefined;

  if (!snapshot) {
    for (const row of rows) {
      const data = meetingJournalData(row);
      if (row.type === JOURNAL_EVENT_TYPES.MEETING_CONVENED) {
        roster = rosterFromUnknown(data.roster);
        chair = chairFromUnknown(data.chair) ?? chair;
        const convenedGoal = typeof data.goal === "string" ? data.goal.trim() : "";
        if (convenedGoal) goal = convenedGoal;
        status = "open";
      } else if (row.type === JOURNAL_EVENT_TYPES.MEETING_CLOSED) {
        status = "closed";
      } else if (row.type === JOURNAL_EVENT_TYPES.MEETING_RESUMED) {
        status = "open";
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
      const speakerId = "participant_id" in from ? from.participant_id : "";
      const artifacts = Array.isArray(data.artifacts)
        ? data.artifacts.filter((id): id is string => typeof id === "string")
        : undefined;
      messages.set(message_id, {
        message_id,
        seq,
        created_at: row.time,
        from,
        to: projectTo(data.to, speakerId, roster),
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
    const receiptAt = row.time;
    const latency_ms = Math.max(
      0,
      Date.parse(receiptAt) - Date.parse(message.created_at),
    );
    const receipt: MeetingTranscriptReceipt = {
      participant_id,
      status: row.type === JOURNAL_EVENT_TYPES.MEETING_DELIVERED ? "delivered" : "failed",
      recorded_at: receiptAt,
      latency_ms: Number.isFinite(latency_ms) ? latency_ms : 0,
      ...(row.type === JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED && typeof data.reason === "string"
        ? { reason: data.reason }
        : {}),
    };
    message.receipts.push(receipt);
  }

  const up_to_seq = rows.reduce((max, row) => Math.max(max, row.meeting_seq ?? 0), 0);
  const rosterDto = toRosterDto(roster);
  const you = resolveTranscriptReader(rosterDto, {
    participant_id: input.reader_participant_id,
    token_space_id: input.token_space_id,
    capabilities: input.capabilities,
  });

  return {
    session_id: prefixedSessionId(input.session_id),
    status,
    roster: rosterDto,
    chair,
    ...(you ? { you } : {}),
    ...(goal ? { goal } : {}),
    since_seq,
    up_to_seq,
    messages: [...messages.values()]
      .filter((message) => message.seq > since_seq)
      .sort((a, b) => a.seq - b.seq)
      .map((message) =>
        you
          ? { ...message, addressed_to_you: addressedToReader(message, you.participant_id) }
          : message,
      ),
  };
}
