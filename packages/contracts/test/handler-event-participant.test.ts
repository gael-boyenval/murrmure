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

  test("shell_spawn meeting handler keeps its harness-owned continuation contract", () => {
    const parsed = HandlerSpecSchema.parse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "shell_spawn",
      command: "cursor agent -p {{prompt}}",
      continuation: {
        command: "cursor agent --resume {{continuation_token}} -p {{prompt}}",
      },
    });
    expect(parsed).toMatchObject({
      continuation: {
        command: "cursor agent --resume {{continuation_token}} -p {{prompt}}",
        token_field: "session_id",
      },
    });
  });

  test("shell_spawn accepts a persistent PTY session with assignment-owned lifetime", () => {
    const parsed = HandlerSpecSchema.parse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "shell_spawn",
      command: "cursor agent --force {{prompt}}",
      session: { mode: "persistent" },
    });
    expect(parsed).toMatchObject({
      session: {
        mode: "persistent",
        transport: "pty",
        shutdown_grace_ms: 5_000,
      },
    });
  });

  test("persistent shell session may declare continuation for resume after close", () => {
    const parsed = HandlerSpecSchema.parse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "shell_spawn",
      command: "cursor agent --force {{prompt}}",
      continuation: {
        command: "cursor agent --resume {{continuation_token}} --force {{prompt}}",
        mint_command: "cursor agent create-chat",
      },
      session: { mode: "persistent" },
    });
    expect(parsed.continuation?.mint_command).toBe("cursor agent create-chat");
    expect(parsed.session?.mode).toBe("persistent");
  });

  test("persistent shell session still rejects process timeout", () => {
    const parsed = HandlerSpecSchema.safeParse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "shell_spawn",
      command: "cursor agent --force {{prompt}}",
      session: { mode: "persistent" },
      timeout_ms: 60_000,
    });
    expect(parsed.success).toBe(false);
  });
});
