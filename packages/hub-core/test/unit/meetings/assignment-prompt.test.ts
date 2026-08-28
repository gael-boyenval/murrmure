import { describe, expect, test } from "vitest";
import {
  formatLiveSaidPrompt,
  renderMurrmureMeetingProtocolEnvelope,
} from "../../../src/meetings/assignment-prompt.js";

const SES = "ses_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PTC = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAD";
const MSG = "msg_01ARZ3NDEKTSV4RRFFQ69G5FA1";

describe("meetings/assignment-prompt", () => {
  test("renders murrmure.meeting/v1 with trigger ids and since_seq", () => {
    const prior = "Empty state breaks this flow.";
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 0,
    });

    expect(protocol.startsWith("Protocol: murrmure.meeting/v1")).toBe(true);
    expect(protocol).toContain(`session_id: ${SES}`);
    expect(protocol).toContain(`participant_id: ${PTC}`);
    expect(protocol).toContain(`message_id: ${MSG}`);
    expect(protocol).toContain("since_seq: 0");
    expect(protocol).toContain("murrmure_meeting_transcript");
    expect(protocol).toContain("murrmure_emit_event");
    expect(protocol).not.toContain(prior);
    expect(protocol).not.toContain("then call murrmure_resolve_step");
    expect(protocol).toContain("Do not call murrmure_resolve_step for this room");
  });

  test("does not reuse the step envelope operating rule", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 12,
    });
    expect(protocol).not.toContain("Protocol: murrmure.agent/v1");
    expect(protocol).not.toContain("murrmure_get_pending_wake");
    expect(protocol).not.toContain("## Contracts");
    expect(protocol).toContain("since_seq: 12");
  });

  test("convene wake has no message_id and says invited", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      trigger: "convened",
      since_seq: 0,
      subject: "KB goal check\nread the desk",
    });
    expect(protocol).toContain("trigger: convened");
    expect(protocol).toContain("You were invited");
    expect(protocol).toContain("This process is your seat");
    expect(protocol).toContain("make one concise initial contribution");
    expect(protocol).toContain("Do not start work");
    expect(protocol).toContain("subject: KB goal check read the desk");
    expect(protocol).not.toContain("message_id:");
  });

  test("resumed wake keeps the same seat and asks to continue", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      trigger: "resumed",
      since_seq: 0,
    });
    expect(protocol).toContain("trigger: resumed");
    expect(protocol).toContain("This room resumed");
    expect(protocol).toContain("same session_id and participant_id");
    expect(protocol).toContain("Continue only if the chair or the meeting goal");
    expect(protocol).not.toContain("You were invited");
  });

  test("said wake says already joined, not a new invite", () => {
    const protocol = renderMurrmureMeetingProtocolEnvelope({
      session_id: SES,
      participant_id: PTC,
      message_id: MSG,
      trigger: "said",
      since_seq: 3,
    });
    expect(protocol).toContain("already joined");
    expect(protocol).toContain("addressed_to_you");
    expect(protocol).toContain("chair or the meeting goal");
    expect(protocol).toContain("not a ticket");
    expect(protocol).toContain("to.participant_ids");
    expect(protocol).not.toContain("You were invited");
  });

  test("later PTY turn includes the human text and protocol envelope", () => {
    const prompt = formatLiveSaidPrompt(
      {
        session_id: SES,
        participant_id: PTC,
        message_id: MSG,
        trigger: "said",
        since_seq: 2,
      },
      { text: "Are you here?", from: { human: true }, to: { all: true } },
    );
    expect(prompt).toContain("from: human chair");
    expect(prompt).toContain("text: Are you here?");
    expect(prompt).toContain("addressed_to_you: true");
    expect(prompt).toContain("Protocol: murrmure.meeting/v1");
    expect(prompt).toContain(`message_id: ${MSG}`);
  });
});
