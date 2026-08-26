import type { MeetingSessionRow } from "@murrmure/hub-persistence";
import { stripSpaceId } from "../bridge/ids.js";

export interface MeetingListRow {
  session_id: string;
  title: string;
  goal?: string;
  status: "open" | "closed";
  roster_count: number;
  roster: Array<{ space_id: string; persona?: string }>;
}

export function toMeetingListRow(meeting: MeetingSessionRow): MeetingListRow {
  const title = meeting.title?.trim();
  return {
    session_id: meeting.session_id.startsWith("ses_")
      ? meeting.session_id
      : `ses_${meeting.session_id}`,
    title: title && title.length > 0 ? title : "Untitled meeting",
    goal: meeting.goal,
    status: meeting.status,
    roster_count: meeting.roster.length,
    roster: meeting.roster.map((seat) => ({
      space_id: seat.space_id,
      ...(seat.persona ? { persona: seat.persona } : {}),
    })),
  };
}

export function sortMeetingList(rows: MeetingListRow[]): MeetingListRow[] {
  return [...rows].sort((left, right) => {
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    return 0;
  });
}

export function meetingRosterTouchesSpace(
  meeting: MeetingSessionRow,
  space_id: string,
): boolean {
  const bare = stripSpaceId(space_id);
  return meeting.roster.some((seat) => stripSpaceId(seat.space_id) === bare);
}
