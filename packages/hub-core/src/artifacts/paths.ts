import { join } from "node:path";

export const MRMR_TEMP_DIR = ".mrmr/dev";
export const INBOX_DIR = "inbox";
export const OUTBOX_DIR = "outbox";

export function exchangeDir(dataDir: string, transferId: string): string {
  return join(dataDir, "exchanges", transferId);
}

export function exchangeFilePath(dataDir: string, transferId: string, name: string): string {
  return join(exchangeDir(dataDir, transferId), name);
}

export function inboxDir(spaceRoot: string, transferId: string): string {
  return join(spaceRoot, MRMR_TEMP_DIR, INBOX_DIR, transferId);
}

export function inboxFilePath(spaceRoot: string, transferId: string, name: string): string {
  return join(inboxDir(spaceRoot, transferId), name);
}

export function outboxFilePath(spaceRoot: string, transferId: string, name: string): string {
  return join(spaceRoot, MRMR_TEMP_DIR, OUTBOX_DIR, transferId, name);
}

/** Relative path from space root for executor context (rev-1 §7.3). */
export function relativeInboxPath(transferId: string, name: string): string {
  return join(MRMR_TEMP_DIR, INBOX_DIR, transferId, name);
}
