import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { DaemonContext } from "./context.js";

export function handleSseSubscribe(c: Context, ctx: DaemonContext, space_id: string) {
  return streamSSE(c, async (stream) => {
    const listener = (evt: { event: string; data: Record<string, unknown> }) => {
      void stream.writeSSE({ event: evt.event, data: JSON.stringify(evt.data) });
    };
    ctx.sseSubscribers.add(listener);

    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "heartbeat", data: "{}" });
    }, 15_000);

    try {
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => resolve());
      });
    } finally {
      clearInterval(heartbeat);
      ctx.sseSubscribers.delete(listener);
    }
  });
}

export function journalTypeToSseEvent(type: string): string | null {
  switch (type) {
    case "state.transition":
      return "journal.append";
    case "checkpoint.created":
      return "gate.pending";
    case "checkpoint.resolved":
      return "gate.resolved";
    case "wait.matched":
      return "wait.resolved";
    default:
      return type === "instance.metadata_patched" ? "journal.append" : null;
  }
}
