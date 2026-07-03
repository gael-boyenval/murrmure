import { describe, expect, test } from "vitest";
import {
  buildSpaceJournalEnvelope,
  validateJournalInlinePayload,
  InlinePayloadExceededError,
} from "../../../src/journal/append.js";
import { INLINE_PAYLOAD_MAX_BYTES } from "@murrmure/contracts";

const envelopeInput = {
  space_id: "spc_testspace00000000001",
  type: "mrmr.action.completed",
  actor_id: "actor_test000000000001",
  session_id: "ses_testsession00000001",
  run_id: "run_testrun00000000001",
  eventId: "evt_01JTESTENVELOPEPADDING0000",
  ts: "2026-01-01T00:00:00.000Z",
};

describe("journal inline cap enforcement", () => {
  test("accepts envelope within limit", () => {
    const data = { blob: "x".repeat(INLINE_PAYLOAD_MAX_BYTES - 500) };
    const envelope = buildSpaceJournalEnvelope({ ...envelopeInput, data });
    expect(() => validateJournalInlinePayload(envelope)).not.toThrow();
  });

  test("rejects serialized envelope over 65536 bytes", () => {
    const data = { blob: "x".repeat(INLINE_PAYLOAD_MAX_BYTES - 100) };
    const envelope = buildSpaceJournalEnvelope({ ...envelopeInput, data });
    expect(() => validateJournalInlinePayload(envelope)).toThrow(InlinePayloadExceededError);
    try {
      validateJournalInlinePayload(envelope);
    } catch (error) {
      expect(error).toBeInstanceOf(InlinePayloadExceededError);
      expect((error as InlinePayloadExceededError).code).toBe("INLINE_PAYLOAD_EXCEEDED");
      expect((error as InlinePayloadExceededError).message).toMatch(/PUT \/v1\/artifacts/);
    }
  });

  test("data alone under cap can still exceed envelope cap", () => {
    const data = { blob: "x".repeat(INLINE_PAYLOAD_MAX_BYTES - 200) };
    expect(() => validateJournalInlinePayload(data)).not.toThrow();
    const envelope = buildSpaceJournalEnvelope({ ...envelopeInput, data });
    expect(() => validateJournalInlinePayload(envelope)).toThrow(InlinePayloadExceededError);
  });
});
