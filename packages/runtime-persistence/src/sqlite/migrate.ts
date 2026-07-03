import type { SqliteHandle } from "./driver.js";

export function migrate(db: SqliteHandle): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seq_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_seq INTEGER NOT NULL DEFAULT 1
    );
    INSERT OR IGNORE INTO seq_counter (id, next_seq) VALUES (1, 1);

    CREATE TABLE IF NOT EXISTS scope_seq (
      scope_id TEXT PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS aggregate_seq (
      aggregate_id TEXT PRIMARY KEY,
      next_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS journal_events (
      seq INTEGER PRIMARY KEY,
      entry_id TEXT NOT NULL UNIQUE,
      scope_id TEXT NOT NULL,
      aggregate_id TEXT,
      scope_seq INTEGER NOT NULL,
      aggregate_seq INTEGER,
      entry_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_journal_scope_seq ON journal_events(scope_id, seq);
    CREATE INDEX IF NOT EXISTS idx_journal_agg_seq ON journal_events(aggregate_id, aggregate_seq);

    CREATE TABLE IF NOT EXISTS aggregate_snapshots (
      aggregate_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      aggregate_id TEXT NOT NULL,
      checkpoint_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_agg ON checkpoints(aggregate_id);

    CREATE TABLE IF NOT EXISTS idempotency (
      command_id TEXT PRIMARY KEY,
      result_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS waits (
      wait_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      aggregate_id TEXT,
      status TEXT NOT NULL,
      wait_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_waits_scope ON waits(scope_id, status);

    CREATE TABLE IF NOT EXISTS fanout_outbox (
      seq INTEGER PRIMARY KEY,
      processed_at TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON fanout_outbox(processed_at, next_attempt_at);

    CREATE TABLE IF NOT EXISTS reactions (
      reaction_id TEXT PRIMARY KEY,
      scope_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      reaction_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reactions_scope ON reactions(scope_id, enabled);

    CREATE TABLE IF NOT EXISTS dedup_ledger (
      fingerprint TEXT PRIMARY KEY,
      reaction_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reaction_queue (
      queue_id TEXT PRIMARY KEY,
      reaction_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      partition_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      attempt_no INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      entry_json TEXT NOT NULL,
      enqueued_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reaction_queue_pending ON reaction_queue(status, partition_key);

    CREATE TABLE IF NOT EXISTS delivery_log (
      entry_id TEXT NOT NULL,
      reaction_id TEXT NOT NULL,
      attempt_no INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      dedup_key TEXT NOT NULL,
      ts TEXT NOT NULL,
      PRIMARY KEY (entry_id, reaction_id, attempt_no)
    );

    CREATE TABLE IF NOT EXISTS projection_states (
      projection_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      aggregate_id TEXT,
      seq INTEGER NOT NULL,
      state_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projection_cursors (
      name TEXT PRIMARY KEY,
      last_seq INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projection_applied (
      name TEXT NOT NULL,
      seq INTEGER NOT NULL,
      PRIMARY KEY (name, seq)
    );

    CREATE TABLE IF NOT EXISTS projection_locks (
      name TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')").run();
}
