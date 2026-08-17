import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { appendMeetingEvent, type MeetingJournalDeps } from "./journal.js";
import { prefixedSpace } from "./roster.js";

export async function appendMeetingDelivered(
  deps: MeetingJournalDeps,
  input: {
    space_id: string;
    session_id: string;
    actor_id: string;
    token_id: string;
    message_id: string;
    participant_id: string;
  },
): Promise<void> {
  await appendMeetingEvent(deps, {
    space_id: prefixedSpace(input.space_id),
    type: JOURNAL_EVENT_TYPES.MEETING_DELIVERED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: input.session_id,
    data: {
      message_id: input.message_id,
      participant_id: input.participant_id,
    },
  });
}

export async function appendMeetingDeliveryFailed(
  deps: MeetingJournalDeps,
  input: {
    space_id: string;
    session_id: string;
    actor_id: string;
    token_id: string;
    message_id: string;
    participant_id: string;
    reason: string;
  },
): Promise<void> {
  await appendMeetingEvent(deps, {
    space_id: prefixedSpace(input.space_id),
    type: JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED,
    actor_id: input.actor_id,
    token_id: input.token_id,
    session_id: input.session_id,
    data: {
      message_id: input.message_id,
      participant_id: input.participant_id,
      reason: input.reason,
    },
  });
}
