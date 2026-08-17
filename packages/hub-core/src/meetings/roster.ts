import type { MeetingChair, MeetingRosterSeat } from "@murrmure/contracts";
import type { MeetingRosterSeatRow, MeetingSnapshotChair } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { duplicateRosterSeat, meetingDenial, type MeetingDenial } from "./errors.js";

export function mintParticipantId(ulid: () => string): string {
  return `ptc_${ulid()}`;
}

export function mintMessageId(ulid: () => string): string {
  return `msg_${ulid()}`;
}

export function seatKey(space_id: string, persona?: string): string {
  return `${stripSpaceId(space_id)}::${persona ?? ""}`;
}

export function prefixedSpace(space_id: string): string {
  return addSpaceId(stripSpaceId(space_id));
}

export function rejectDuplicateSeats(seats: MeetingRosterSeat[]): MeetingDenial | null {
  const seen = new Set<string>();
  for (const seat of seats) {
    const key = seatKey(seat.space_id, seat.persona);
    if (seen.has(key)) {
      return duplicateRosterSeat(prefixedSpace(seat.space_id), seat.persona);
    }
    seen.add(key);
  }
  return null;
}

export function mintRoster(
  seats: MeetingRosterSeat[],
  ulid: () => string,
): MeetingRosterSeatRow[] {
  return seats.map((seat) => ({
    participant_id: mintParticipantId(ulid),
    space_id: prefixedSpace(seat.space_id),
    persona: seat.persona,
  }));
}

export function resolveChair(
  roster: MeetingRosterSeatRow[],
  chair: MeetingChair,
): MeetingSnapshotChair | MeetingDenial {
  if ("human" in chair && chair.human) {
    return { human: true };
  }
  const match = roster.find(
    (seat) =>
      stripSpaceId(seat.space_id) === stripSpaceId(chair.space_id) &&
      (seat.persona ?? "") === (chair.persona ?? ""),
  );
  if (!match) {
    return meetingDenial(
      "CONTRACT_VALIDATION_DENIED",
      "Chair must be a roster seat or { human: true }",
    );
  }
  return { participant_id: match.participant_id };
}

export function findSeat(
  roster: MeetingRosterSeatRow[],
  participant_id: string,
): MeetingRosterSeatRow | undefined {
  return roster.find((seat) => seat.participant_id === participant_id);
}

export function seatsForSpace(
  roster: MeetingRosterSeatRow[],
  space_id: string,
): MeetingRosterSeatRow[] {
  const bare = stripSpaceId(space_id);
  return roster.filter((seat) => stripSpaceId(seat.space_id) === bare);
}

export function rosterSpaceIds(roster: MeetingRosterSeatRow[]): string[] {
  return [...new Set(roster.map((seat) => prefixedSpace(seat.space_id)))];
}

export function isHumanChair(chair: MeetingSnapshotChair): chair is { human: true } {
  return "human" in chair && chair.human === true;
}

export function chairParticipantId(chair: MeetingSnapshotChair): string | undefined {
  return "participant_id" in chair ? chair.participant_id : undefined;
}
