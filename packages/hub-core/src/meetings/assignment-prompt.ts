import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HookSourceEvent } from "../hooks/matcher.js";
import { loadMeeting } from "./snapshot.js";
import { meetingJournalData, meetingSpeakerLabel } from "./transcript.js";

export type MeetingWakeData = {
  session_id: string;
  participant_id: string;
  message_id?: string;
  trigger: "convened" | "said" | "resumed";
  since_seq: number;
  goal?: string;
  subject?: string;
};

const GOAL_AUTHORITY =
  "The verbatim `goal` in this block and `murrmure_meeting_transcript.goal` are authoritative. Chair said may clarify or override the goal. If the goal names this seat and requests work, do it this turn without waiting for a chair repeat.";

export function normalizeMeetingWakeTrigger(
  trigger: unknown,
  message_id?: unknown,
): MeetingWakeData["trigger"] {
  if (trigger === "convened" || trigger === "said" || trigger === "resumed") return trigger;
  return typeof message_id === "string" && message_id ? "said" : "convened";
}

export function meetingWakeGoalFields(params: {
  goal?: unknown;
  subject?: unknown;
}): Pick<MeetingWakeData, "goal" | "subject"> {
  const raw =
    (typeof params.goal === "string" && params.goal.trim()) ||
    (typeof params.subject === "string" && params.subject.trim()) ||
    undefined;
  return raw ? { goal: raw, subject: raw } : {};
}

function compactGoalLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function renderMurrmureMeetingProtocolEnvelope(input: MeetingWakeData): string {
  const session_id = input.session_id.startsWith("ses_") ? input.session_id : `ses_${input.session_id}`;
  const lines = [
    "Protocol: murrmure.meeting/v1",
    "",
    `session_id: ${session_id}`,
    `participant_id: ${input.participant_id}`,
    `trigger: ${input.trigger}`,
    `since_seq: ${input.since_seq}`,
  ];
  const goal = input.goal?.trim() || input.subject?.trim();
  if (goal) {
    const compact = compactGoalLine(goal);
    lines.push(`goal: ${compact}`);
    lines.push(`subject: ${compact}`);
  }
  if (input.message_id) lines.push(`message_id: ${input.message_id}`);
  const operatingRule =
    input.trigger === "convened"
      ? `Operating rule: You were invited. This process is your seat. ${GOAL_AUTHORITY} Pull murrmure_meeting_transcript with session_id, since_seq 0, and this participant_id. Read \`you\` and the goal. If another roster seat is present, make one concise initial contribution that addresses the meeting goal using murrmure_emit_event type mrmr.meeting.said; a text answer in this process is not a room reply, and the turn is incomplete until the event succeeds. If you are the room's only roster seat, stay silent unless the goal explicitly names this seat — then do that work this turn and journal the result (to.all is journal-only when a human chair is present). Do not start work, write files, or attach artifacts on convene unless the goal explicitly names this seat to do that work. Another seat's presence is not a work order. Later said resumes this same conversation — do not treat it as a new invite. Do not call murrmure_resolve_step for this room.`
      : input.trigger === "resumed"
        ? `Operating rule: This room resumed. This process is your seat again — same session_id and participant_id. ${GOAL_AUTHORITY} Pull murrmure_meeting_transcript with session_id, since_seq, and this participant_id. Read \`you\` and messages with addressed_to_you. Continue only if the chair or the meeting goal still asks this seat for something. Do not re-introduce. Do not invent work from peer intros or side talk. If the chair or goal asked this seat to do work, do that work this turn. Use murrmure_emit_event type mrmr.meeting.said when you speak; a text answer in this process is not a room reply. Do not call murrmure_resolve_step for this room.`
        : `Operating rule: One or more said events arrived in a room you already joined. ${GOAL_AUTHORITY} Pull prior turns once with murrmure_meeting_transcript using session_id, since_seq, and this participant_id. Read \`you\` and every message with addressed_to_you. Speak or edit only if the chair or the meeting goal asked this seat something (a question, a named task, or an explicit work request). Another seat's intro, role dump, or peer design talk is not a ticket. Do not invent work. Do not attach artifacts unless the chair or the goal asked for them. If the chair or goal did ask this seat for work, do that work this turn — do not answer with only working / in progress / starting now. When you stay silent, do not emit. When you speak, use murrmure_emit_event type mrmr.meeting.said, target the asker with to.participant_ids, set in_reply_to when appropriate, and never re-introduce, acknowledge, paraphrase, or repeat material already in the transcript. Do not call murrmure_resolve_step for this room.`;
  lines.push("", operatingRule);
  return lines.join("\n");
}

export function isMeetingSaidHandler(handler: { on?: unknown } | undefined): boolean {
  if (!handler?.on || typeof handler.on !== "object") return false;
  const on = handler.on as { event?: { type?: string } };
  return (
    on.event?.type === JOURNAL_EVENT_TYPES.MEETING_SAID ||
    on.event?.type === JOURNAL_EVENT_TYPES.MEETING_CONVENED
  );
}

export function isMeetingWakeParams(
  params: Record<string, unknown> | undefined,
): params is Record<string, unknown> & {
  session_id: string;
  participant_id: string;
  since_seq: number;
  trigger?: unknown;
  message_id?: unknown;
} {
  if (!params) return false;
  return (
    typeof params.session_id === "string" &&
    typeof params.participant_id === "string" &&
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

async function resolveMeetingGoal(
  studio: StudioPersistencePort,
  session_id: string,
): Promise<string | undefined> {
  const snapshot = await loadMeeting(studio, session_id);
  const fromSnapshot = snapshot?.goal?.trim();
  if (fromSnapshot) return fromSnapshot;

  const rows = await studio.queryMeetingJournal({
    session_id,
    types: [JOURNAL_EVENT_TYPES.MEETING_CONVENED],
  });
  for (const row of rows) {
    const data = meetingJournalData(row);
    const fromJournal = typeof data.goal === "string" ? data.goal.trim() : "";
    if (fromJournal) return fromJournal;
  }
  return undefined;
}

export async function buildMeetingWakeData(
  studio: StudioPersistencePort,
  event: HookSourceEvent,
): Promise<MeetingWakeData | null> {
  const session_id = event.session_id?.trim();
  const participant_id = event.participant_id?.trim();
  if (!session_id || !participant_id) return null;
  const prefixed = session_id.startsWith("ses_") ? session_id : `ses_${session_id}`;
  const goalFields = meetingWakeGoalFields({ goal: await resolveMeetingGoal(studio, prefixed) });

  if (event.event_type === JOURNAL_EVENT_TYPES.MEETING_CONVENED) {
    return {
      session_id: prefixed,
      participant_id,
      trigger: "convened",
      since_seq: 0,
      ...goalFields,
    };
  }

  if (event.event_type === JOURNAL_EVENT_TYPES.MEETING_RESUMED) {
    return {
      session_id: prefixed,
      participant_id,
      trigger: "resumed",
      since_seq: 0,
      ...goalFields,
    };
  }

  if (event.event_type !== JOURNAL_EVENT_TYPES.MEETING_SAID) return null;
  const message_id =
    typeof event.payload.message_id === "string" ? event.payload.message_id : undefined;
  if (!message_id) return null;
  const since_seq = await lastDeliveryMeetingSeq(studio, session_id, participant_id);
  return {
    session_id: prefixed,
    participant_id,
    message_id,
    trigger: "said",
    since_seq,
    ...goalFields,
  };
}

function payloadAddressedToYou(
  payload: Record<string, unknown>,
  participant_id: string,
): boolean | undefined {
  const to = asRecord(payload.to);
  if (!to) return undefined;
  if (to.all === true) return true;
  if (Array.isArray(to.participant_ids)) {
    return to.participant_ids.includes(participant_id);
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/** Later PTY turn: the new message plus the meeting protocol envelope. */
export function formatLiveSaidPrompt(
  wake: MeetingWakeData,
  payload: Record<string, unknown>,
): string {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const lines = ["New message in this meeting.", ""];
  if (text) {
    const from = asRecord(payload.from) ?? {};
    lines.push(`from: ${meetingSpeakerLabel(from)}`, `text: ${text}`);
    const addressed = payloadAddressedToYou(payload, wake.participant_id);
    if (addressed != null) lines.push(`addressed_to_you: ${addressed}`);
    lines.push("");
  }
  lines.push(
    renderMurrmureMeetingProtocolEnvelope({
      ...wake,
      trigger: "said",
    }),
  );
  return lines.join("\n");
}

export function meetingWakeExecContext(wake: MeetingWakeData): Record<string, unknown> {
  const type =
    wake.trigger === "convened"
      ? JOURNAL_EVENT_TYPES.MEETING_CONVENED
      : wake.trigger === "resumed"
        ? JOURNAL_EVENT_TYPES.MEETING_RESUMED
        : JOURNAL_EVENT_TYPES.MEETING_SAID;
  return {
    event: {
      type,
      data: { ...wake },
    },
  };
}
