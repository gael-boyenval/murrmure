import { describe, expect, test } from "vitest";
import type { MeetingTranscript } from "@murrmure/shell-client";
import {
  meetingTranscriptRefetchInterval,
  OPEN_MEETING_POLL_MS,
} from "./useMeetingTranscript.js";

function transcript(status: MeetingTranscript["status"]): MeetingTranscript {
  return {
    session_id: "ses_room",
    status,
    roster: [],
    chair: { human: true },
    since_seq: 0,
    up_to_seq: 0,
    messages: [],
  };
}

describe("meeting transcript refresh", () => {
  test("polls an open room as an SSE fallback", () => {
    expect(meetingTranscriptRefetchInterval(transcript("open"))).toBe(OPEN_MEETING_POLL_MS);
  });

  test("stops polling after the room closes", () => {
    expect(meetingTranscriptRefetchInterval(transcript("closed"))).toBe(false);
    expect(meetingTranscriptRefetchInterval(null)).toBe(false);
  });
});
