import Database from "better-sqlite3";

export interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint };
}

export interface SqliteHandle {
  pragma(statement: string): unknown;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  transaction<T extends (...args: unknown[]) => void>(fn: T): T;
  close(): void;
}

function wrapBetterSqlite(db: Database.Database): SqliteHandle {
  return {
    pragma: (statement) => db.pragma(statement),
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    transaction: <T extends (...args: unknown[]) => void>(fn: T) => db.transaction(fn) as unknown as T,
    close: () => db.close(),
  };
}

export function openBetterSqliteDatabase(path: string = ":memory:"): SqliteHandle {
  return wrapBetterSqlite(new Database(path));
}
