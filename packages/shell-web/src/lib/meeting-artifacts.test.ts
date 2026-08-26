import { describe, expect, it } from "vitest";
import type { MeetingTranscript } from "@murrmure/shell-client";
import { listTranscriptArtifacts } from "./meeting-artifacts.js";

const transcript: MeetingTranscript = {
  session_id: "ses_room",
  status: "open",
  roster: [],
  chair: { human: true },
  since_seq: 0,
  up_to_seq: 4,
  messages: [
    {
      message_id: "msg_1",
      seq: 2,
      created_at: "2026-08-17T15:00:00.000Z",
      from: { participant_id: "ptc_a", space_id: "spc_app", persona: "designer" },
      to: { all: true, participant_ids: [] },
      text: "one",
      artifacts: ["xfr_a", "xfr_b"],
      receipts: [],
    },
    {
      message_id: "msg_2",
      seq: 4,
      created_at: "2026-08-17T15:01:00.000Z",
      from: { human: true },
      to: { all: true, participant_ids: [] },
      text: "again",
      artifacts: ["xfr_a"],
      receipts: [],
    },
  ],
};

describe("listTranscriptArtifacts", () => {
  it("keeps first share of each transfer_id", () => {
    expect(listTranscriptArtifacts(transcript)).toEqual([
      {
        transfer_id: "xfr_a",
        message_id: "msg_1",
        created_at: "2026-08-17T15:00:00.000Z",
        fromLabel: "designer",
        participant_id: "ptc_a",
      },
      {
        transfer_id: "xfr_b",
        message_id: "msg_1",
        created_at: "2026-08-17T15:00:00.000Z",
        fromLabel: "designer",
        participant_id: "ptc_a",
      },
    ]);
  });
});
