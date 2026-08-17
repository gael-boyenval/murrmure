import type { HubHandler } from "../handlers/hub.js";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";

export type MeetingJournalDeps = {
  studio: StudioPersistencePort;
  handler: HubHandler;
  ids: { ulid: () => string };
};

export async function appendMeetingEvent(
  deps: MeetingJournalDeps,
  input: {
    space_id: string;
    type: string;
    actor_id: string;
    token_id: string;
    session_id: string;
    data: Record<string, unknown>;
    event_id?: string;
  },
): Promise<{ seq: number; entry_id: string; meeting_seq: number }> {
  const meeting_seq = await deps.studio.allocateMeetingSeq(input.session_id);
  const event_id = input.event_id ?? `evt_${deps.ids.ulid()}`;
  const journaled = await deps.handler.appendSpaceJournal({
    space_id: input.space_id,
    type: input.type,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: input.session_id,
    event_id,
    data: input.data,
  });
  await deps.studio.setJournalIndexMeetingSeq(event_id, meeting_seq);
  return { seq: journaled.seq, entry_id: event_id, meeting_seq };
}
