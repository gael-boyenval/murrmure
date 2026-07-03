import type { PersistencePort } from "@murrmure/runtime-contracts";
import { createSqlitePersistence } from "./sqlite/store.js";

declare const Bun: { version: string } | undefined;

/** Select persistence backend: bun:sqlite in Bun runtime, better-sqlite3 in Node. */
export async function createRuntimePersistence(path?: string): Promise<PersistencePort> {
  if (typeof Bun !== "undefined") {
    const { createBunSqlitePersistence } = await import("./bun-sqlite/store.js");
    return createBunSqlitePersistence(path);
  }
  return createSqlitePersistence(path);
}
