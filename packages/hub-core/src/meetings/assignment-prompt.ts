import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HookSourceEvent } from "../hooks/matcher.js";
import { meetingJournalData } from "./transcript.js";

export type MeetingWakeData = {
  session_id: string;
  participant_id: string;
  message_id: string;
  since_seq: number;
};

export function renderMurrmureMeetingProtocolEnvelope(input: MeetingWakeData): string {
  const session_id = input.session_id.startsWith("ses_") ? input.session_id : `ses_${input.session_id}`;
  return [
    "Protocol: murrmure.meeting/v1",
    "",
    `session_id: ${session_id}`,
    `participant_id: ${input.participant_id}`,
    `message_id: ${input.message_id}`,
    `since_seq: ${input.since_seq}`,
    "",
    "Operating rule: Pull prior turns with murrmure_meeting_transcript using session_id and since_seq. Respond with murrmure_emit_event type mrmr.meeting.said. Do not call murrmure_resolve_step for this room.",
  ].join("\n");
}

export function isMeetingSaidHandler(handler: { on?: unknown } | undefined): boolean {
  if (!handler?.on || typeof handler.on !== "object") return false;
  const on = handler.on as { event?: { type?: string } };
  return on.event?.type === JOURNAL_EVENT_TYPES.MEETING_SAID;
}

export function isMeetingWakeParams(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  return (
    typeof params.session_id === "string" &&
    typeof params.participant_id === "string" &&
    typeof params.message_id === "string" &&
    params.message_id.startsWith("msg_") &&
    typeof params.since_seq === "number"
  );
}

export async function lastDeliveryMeetingSeq(
  studio: StudioPersistencePort,
  session_id: string,
  participant_id: string,
): Promise<number> {
  const rows = await studio.queryMeetingJournal({
    session_id,
    types: [JOURNAL_EVENT_TYPES.MEETING_DELIVERED],
  });
  let max = 0;
  for (const row of rows) {
    const data = meetingJournalData(row);
    if (data.participant_id === participant_id) {
      max = Math.max(max, row.meeting_seq ?? 0);
    }
  }
  return max;
}

export async function buildMeetingWakeData(
  studio: StudioPersistencePort,
  event: HookSourceEvent,
): Promise<MeetingWakeData | null> {
  if (event.event_type !== JOURNAL_EVENT_TYPES.MEETING_SAID) return null;
  const session_id = event.session_id?.trim();
  const message_id =
    typeof event.payload.message_id === "string" ? event.payload.message_id : undefined;
  const participant_id = event.participant_id?.trim();
  if (!session_id || !message_id || !participant_id) return null;
  const since_seq = await lastDeliveryMeetingSeq(studio, session_id, participant_id);
  return {
    session_id: session_id.startsWith("ses_") ? session_id : `ses_${session_id}`,
    participant_id,
    message_id,
    since_seq,
  };
}

export function meetingWakeExecContext(wake: MeetingWakeData): Record<string, unknown> {
  return {
    event: {
      type: JOURNAL_EVENT_TYPES.MEETING_SAID,
      data: { ...wake },
    },
  };
}
