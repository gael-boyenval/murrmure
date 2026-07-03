import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

/** SSE event names the shell listens for (hub broadcast + journal types). */
export const JOURNAL_SSE_EVENTS = [
  "journal.append",
  "gate.pending",
  "gate.resolved",
  "notification.changed",
  "out_of_shell.desktop",
  "wait.resolved",
  "flow.dev_reload",
  "flow.live_applied",
  "space.list_changed",
  JOURNAL_EVENT_TYPES.SPACE_INDEX_UPDATED,
  "heartbeat",
] as const;

export type JournalSseEventName = (typeof JOURNAL_SSE_EVENTS)[number];

export interface ParsedSseMessage {
  event: string;
  data: Record<string, unknown>;
}

/** Parse an SSE message body; returns null for heartbeats and malformed payloads. */
export function parseSseMessage(event: string, rawData: string): ParsedSseMessage | null {
  if (event === "heartbeat") return null;
  if (!rawData || rawData === "{}") return null;

  let data: unknown;
  try {
    data = JSON.parse(rawData);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }

  return { event, data: data as Record<string, unknown> };
}
