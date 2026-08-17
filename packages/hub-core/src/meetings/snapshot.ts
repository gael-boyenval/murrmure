import type { MeetingSessionRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { meetingAlreadyOpen, type MeetingDenial } from "./errors.js";

export async function loadMeeting(
  studio: StudioPersistencePort,
  session_id: string,
): Promise<MeetingSessionRow | null> {
  return studio.getMeetingBySession(session_id);
}

export async function writeMeetingSnapshot(
  studio: StudioPersistencePort,
  row: MeetingSessionRow,
): Promise<{ ok: true } | MeetingDenial> {
  const result = await studio.upsertMeetingSnapshot(row);
  if (!result.ok) return meetingAlreadyOpen();
  return { ok: true };
}
