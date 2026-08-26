import { afterEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { migrateStudio } from "../src/migrate.js";

describe("journal_index meeting_seq migrate", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  test("adds meeting_seq on a pre-meeting journal_index", () => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE journal_index (
        entry_id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        space_id TEXT NOT NULL,
        type TEXT NOT NULL,
        subject TEXT,
        session_id TEXT,
        run_id TEXT,
        actor_id TEXT,
        time TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);

    expect(() => migrateStudio(db)).not.toThrow();

    const cols = db.prepare("PRAGMA table_info(journal_index)").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain("meeting_seq");
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_journal_index_meeting_seq'")
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_journal_index_meeting_seq");
  });
});
