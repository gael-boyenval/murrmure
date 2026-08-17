import { describe, expect, test } from "vitest";
import { renderMurrmureMeetingProtocolEnvelope } from "../../../src/meetings/assignment-prompt.js";

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
      since_seq: 12,
    });
    expect(protocol).not.toContain("Protocol: murrmure.agent/v1");
    expect(protocol).not.toContain("murrmure_get_pending_wake");
    expect(protocol).not.toContain("## Contracts");
    expect(protocol).toContain("since_seq: 12");
  });
});
