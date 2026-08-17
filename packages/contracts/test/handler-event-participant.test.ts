import { describe, expect, test } from "vitest";
import { HandlerEventFilterSchema, HandlerSpecSchema } from "../src/index.js";

describe("handler event participant", () => {
  test("participant survives HandlerEventFilterSchema parse", () => {
    const parsed = HandlerEventFilterSchema.parse({
      type: "mrmr.meeting.said",
      participant: "designer",
    });
    expect(parsed).toEqual({ type: "mrmr.meeting.said", participant: "designer" });
    expect(parsed.participant).toBe("designer");
  });

  test("HandlerSpecSchema keeps nested on.event.participant", () => {
    const parsed = HandlerSpecSchema.parse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "mcp_session",
    });
    expect(parsed.on).toEqual({
      event: { type: "mrmr.meeting.said", participant: "designer" },
    });
  });

  test("executor .strict() still rejects unknown root keys", () => {
    const parsed = HandlerSpecSchema.safeParse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said" } },
      type: "mcp_session",
      participant: "designer",
    });
    expect(parsed.success).toBe(false);
  });
});
