import { EventsFileSchema, type EventsFile } from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export function parseEventsFile(raw: unknown): ParseResult<EventsFile> {
  const parsed = EventsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_EVENTS",
      message: "events.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
