import { describe, expect, test } from "vitest";
import { handshakeDrainCursor } from "../../src/control-bus.js";

describe("handshakeDrainCursor", () => {
  test("replays from zero when the client ack is ahead of the hub seq", () => {
    expect(handshakeDrainCursor(42, 1)).toBe(0);
    expect(handshakeDrainCursor(1, 1)).toBe(1);
    expect(handshakeDrainCursor(0, 1)).toBe(0);
  });
});
