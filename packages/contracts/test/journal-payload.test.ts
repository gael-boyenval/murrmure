import { describe, expect, test } from "vitest";
import {
  INLINE_PAYLOAD_MAX_BYTES,
  assertInlinePayloadWithinLimit,
  inlinePayloadByteLength,
  isInlinePayloadWithinLimit,
} from "../src/journal/inline-payload.js";

describe("journal inline payload cap", () => {
  test("accepts payload at 64 KiB boundary", () => {
    const payload = { blob: "x".repeat(INLINE_PAYLOAD_MAX_BYTES - 20) };
    expect(isInlinePayloadWithinLimit(payload)).toBe(true);
    expect(() => assertInlinePayloadWithinLimit(payload)).not.toThrow();
  });

  test("rejects payload over 65536 bytes", () => {
    const payload = { blob: "x".repeat(INLINE_PAYLOAD_MAX_BYTES) };
    expect(inlinePayloadByteLength(payload)).toBeGreaterThan(INLINE_PAYLOAD_MAX_BYTES);
    expect(isInlinePayloadWithinLimit(payload)).toBe(false);
    expect(() => assertInlinePayloadWithinLimit(payload)).toThrow(/65536/);
  });
});
