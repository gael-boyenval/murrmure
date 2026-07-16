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
