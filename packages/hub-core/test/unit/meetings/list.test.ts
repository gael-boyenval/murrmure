import { describe, expect, test } from "vitest";
import { meetingRosterTouchesSpace, toMeetingListRow } from "../../../src/meetings/list.js";
import type { MeetingSessionRow } from "@murrmure/hub-persistence";

function meeting(overrides: Partial<MeetingSessionRow> = {}): MeetingSessionRow {
  return {
    session_id: "01M07M5NK5XPETG855F3W3N8PE",
    status: "open",
    title: "say hello to each other",
    goal: "present yourself",
    chair: { human: true },
    roster: [
      { participant_id: "ptc_a", space_id: "spc_murrmure", persona: "developer" },
      { participant_id: "ptc_b", space_id: "spc_memory", persona: "default" },
    ],
    convene_entry_id: "ent_1",
    convene_meeting_seq: 1,
    updated_at: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("meeting list", () => {
  test("projects an open meeting with ses_ prefix", () => {
    expect(toMeetingListRow(meeting())).toEqual({
      session_id: "ses_01M07M5NK5XPETG855F3W3N8PE",
      title: "say hello to each other",
      goal: "present yourself",
      status: "open",
      roster_count: 2,
      roster: [
        { space_id: "spc_murrmure", persona: "developer" },
        { space_id: "spc_memory", persona: "default" },
      ],
    });
  });

  test("includes closed meetings", () => {
    expect(toMeetingListRow(meeting({ status: "closed" }))).toMatchObject({
      status: "closed",
      session_id: "ses_01M07M5NK5XPETG855F3W3N8PE",
    });
  });

  test("roster touch is space-id, not ownership", () => {
    expect(meetingRosterTouchesSpace(meeting(), "spc_memory")).toBe(true);
    expect(meetingRosterTouchesSpace(meeting(), "spc_other")).toBe(false);
  });
});
