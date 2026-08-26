import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlMessage } from "./hub-client.js";

export interface PendingWakeRecord {
  received_at: string;
  method: string;
  seq?: number;
  action_name?: string;
  run_id?: string;
  session_id?: string;
  prompt: string;
}

const WAKE_METHODS = new Set(["murrmure/control.invoke_action"]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function isWakeMessage(method: string): boolean {
  return WAKE_METHODS.has(method);
}

export function isMeetingSaidMessage(method: string): boolean {
  return method === "murrmure/control.meeting_said";
}

function meetingSaidKey(message: ControlMessage): string | null {
  if (!isMeetingSaidMessage(message.method)) return null;
  const session_id = asString(message.params.session_id);
  const participant_id = asString(message.params.participant_id);
  const handler_id = asString(message.params.handler_id);
  if (!session_id || !participant_id || !handler_id) return null;
  return `${session_id}:${participant_id}:${handler_id}`;
}

function asCursor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function rewriteMeetingPrompt(
  prompt: unknown,
  input: { message_id?: string; since_seq?: number; count: number },
): string | undefined {
  if (typeof prompt !== "string" || !prompt.trim()) return undefined;
  let rewritten = prompt;
  if (input.message_id) {
    rewritten = rewritten.replace(/^message_id:.*$/gm, `message_id: ${input.message_id}`);
  }
  if (input.since_seq != null) {
    rewritten = rewritten.replace(/^since_seq:.*$/gm, `since_seq: ${input.since_seq}`);
  }
  if (input.count > 1) {
    rewritten += `\n\nBatched said events: ${input.count}. Pull once from since_seq and answer the room once.`;
  }
  return rewritten;
}

/**
 * Collapse multiple said notifications for the same live seat into one model
 * turn. Keep the earliest cursor so one transcript pull includes every missed
 * message, while retaining the latest control seq/message id for observability.
 */
export function coalesceMeetingSaidMessages(messages: ControlMessage[]): ControlMessage[] {
  const output: ControlMessage[] = [];
  const positions = new Map<string, { index: number; count: number; since_seq?: number }>();

  for (const message of messages) {
    const key = meetingSaidKey(message);
    if (!key) {
      output.push(message);
      continue;
    }

    const existing = positions.get(key);
    const cursor = asCursor(message.params.since_seq);
    if (!existing) {
      positions.set(key, { index: output.length, count: 1, since_seq: cursor });
      output.push(message);
      continue;
    }

    existing.count += 1;
    if (cursor != null) {
      existing.since_seq =
        existing.since_seq == null ? cursor : Math.min(existing.since_seq, cursor);
    }
    const message_id = asString(message.params.message_id);
    output[existing.index] = {
      ...message,
      params: {
        ...message.params,
        ...(existing.since_seq != null ? { since_seq: existing.since_seq } : {}),
        ...(message_id ? { message_id } : {}),
        coalesced_count: existing.count,
        prompt: rewriteMeetingPrompt(message.params.prompt, {
          message_id,
          since_seq: existing.since_seq,
          count: existing.count,
        }),
      },
    };
  }

  return output;
}

export function buildPendingWakeRecord(
  message: ControlMessage,
  prompt: string,
): PendingWakeRecord {
  const params = message.params;
  return {
    received_at: new Date().toISOString(),
    method: message.method,
    seq: typeof params.seq === "number" ? params.seq : undefined,
    action_name: asString(params.action_name),
    run_id: asString(params.run_id),
    session_id: asString(params.session_id),
    prompt,
  };
}

function resolvePendingWakeRoot(defaultRoot: string): string {
  const fromEnv = process.env.MURRMURE_SPACE_ROOT?.trim();
  return fromEnv || defaultRoot;
}

export function writePendingWakeFile(
  record: PendingWakeRecord,
  root: string = resolvePendingWakeRoot(process.cwd()),
): string {
  const dir = join(root, ".mrmr", "dev");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "pending-wake.json");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}
