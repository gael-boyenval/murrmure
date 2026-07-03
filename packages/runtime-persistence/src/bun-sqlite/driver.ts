/// <reference path="./bun-sqlite.d.ts" />
import { Database as BunDatabase } from "bun:sqlite";

export type { SqliteHandle, SqliteStatement } from "../sqlite/driver.js";

export function openBunSqliteDatabase(path: string = ":memory:"): import("../sqlite/driver.js").SqliteHandle {
  const db = new BunDatabase(path, { create: true });

  return {
    pragma: (statement) => {
      db.run(`PRAGMA ${statement}`);
      return undefined;
    },
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) =>
          stmt.run(...params) as { changes: number; lastInsertRowid?: number | bigint },
      };
    },
    transaction: (fn) => {
      const wrapped = db.transaction(fn);
      return wrapped as typeof fn;
    },
    close: () => {
      db.close();
    },
  };
}
