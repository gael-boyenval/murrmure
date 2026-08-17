import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";

export type MeetingDenial = {
  ok: false;
  code: string;
  message: string;
  http: 400 | 403 | 409;
};

export function meetingDenial(
  code: string,
  message: string,
  http: 400 | 403 | 409 = 400,
): MeetingDenial {
  return { ok: false, code, message, http };
}

export function personaNotFound(persona: string, space_id: string): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.PERSONA_NOT_FOUND,
    `Persona '${persona}' is not indexed on ${space_id}`,
  );
}

export function meetingAlreadyOpen(): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.MEETING_ALREADY_OPEN,
    "A meeting is already open on this session",
    409,
  );
}

export function meetingClosed(): MeetingDenial {
  return meetingDenial(MURRMURE_DENIAL_CODES.MEETING_CLOSED, "Meeting is closed");
}

export function meetingChairRequired(): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED,
    "Only the chair may close this meeting",
    403,
  );
}

export function notMeetingMember(message = "Not a roster member of this meeting"): MeetingDenial {
  return meetingDenial(MURRMURE_DENIAL_CODES.NOT_MEETING_MEMBER, message, 403);
}

export function participantAmbiguous(): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.PARTICIPANT_AMBIGUOUS,
    "as_participant_id is required when the emitter space has more than one seat",
  );
}

export function toAmbiguous(): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.TO_AMBIGUOUS,
    "to must be either { participant_ids } or { all: true }",
  );
}

export function toEmpty(): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.TO_EMPTY,
    "Resolved delivery list is empty after dropping the speaker",
  );
}

export function replyUnknown(message_id: string): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.REPLY_UNKNOWN,
    `in_reply_to '${message_id}' is not a said in this session`,
  );
}

export function sessionNotFound(): MeetingDenial {
  return meetingDenial(MURRMURE_DENIAL_CODES.SESSION_NOT_FOUND, "Session not found");
}

export function duplicateRosterSeat(space_id: string, persona?: string): MeetingDenial {
  return meetingDenial(
    MURRMURE_DENIAL_CODES.CONTRACT_VALIDATION_DENIED,
    persona
      ? `Duplicate roster seat ${space_id}:${persona}`
      : `Duplicate default-seat invite for ${space_id}`,
  );
}
