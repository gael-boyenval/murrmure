export type MeetingSeatPick = { space_id: string; persona: string };

export function seatKey(seat: MeetingSeatPick): string {
  return `${seat.space_id}:${seat.persona}`;
}

export function parseSeatKey(key: string): MeetingSeatPick {
  const idx = key.indexOf(":");
  return { space_id: key.slice(0, idx), persona: key.slice(idx + 1) };
}

export function toggleSeat(selected: Set<string>, seat: MeetingSeatPick): Set<string> {
  const next = new Set(selected);
  const key = seatKey(seat);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function setSpaceSeats(
  selected: Set<string>,
  spaceId: string,
  personas: string[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const persona of personas) {
    const key = seatKey({ space_id: spaceId, persona });
    if (on) next.add(key);
    else next.delete(key);
  }
  return next;
}

export function spaceSelectionState(
  selected: Set<string>,
  spaceId: string,
  personas: string[],
): boolean | "indeterminate" {
  if (personas.length === 0) return false;
  let n = 0;
  for (const persona of personas) {
    if (selected.has(seatKey({ space_id: spaceId, persona }))) n += 1;
  }
  if (n === 0) return false;
  if (n === personas.length) return true;
  return "indeterminate";
}

export function buildMeetingStartBody(input: {
  title: string;
  goal: string;
  selected: Set<string>;
}): {
  title: string;
  goal?: string;
  participants: MeetingSeatPick[];
  chair: { human: true };
} {
  const title = input.title.trim() || "Meeting";
  const goal = input.goal.trim() || undefined;
  return {
    title,
    goal,
    participants: [...input.selected].map(parseSeatKey),
    chair: { human: true },
  };
}
