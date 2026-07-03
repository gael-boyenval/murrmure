import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PendingWakeRecord {
  received_at: string;
  method: string;
  action_name?: string;
  run_id?: string;
  session_id?: string;
  prompt: string;
}

export function resolveSpaceRoot(): string {
  const fromEnv = process.env.MURRMURE_SPACE_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return process.cwd();
}

export function writePendingWakeFile(record: PendingWakeRecord): string {
  const root = resolveSpaceRoot();
  const dir = join(root, ".murrmure");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "pending-wake.json");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return path;
}
