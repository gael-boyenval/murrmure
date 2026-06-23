import Database from "better-sqlite3";
import type {
  Aggregate,
  AllocatedSeq,
  Checkpoint,
  CheckpointStatus,
  CommandResult,
  DeliveryLogEntry,
  JournalEntry,
  JournalEntryDraft,
  PersistencePort,
  ReactionQueueItem,
  ReactionSpec,
  Transaction,
  WaitRow,
} from "@runtime/contracts";
import { fromJson, projectionKey, toCanonicalJson } from "./json.js";
import { migrate } from "./migrate.js";

class SqliteTransaction implements Transaction {
  private journalDrafts: JournalEntry[] = [];
  private snapshotOps: Array<{ aggregate: Aggregate; expectedRevision: number; result: "ok" | "conflict" }> = [];
  private checkpointOps: Checkpoint[] = [];
  private checkpointCasOps: Array<{
    id: string;
    expected: CheckpointStatus;
    next: CheckpointStatus;
    result: boolean;
  }> = [];
  private idempotencyOps: Array<{ command_id: string; result: CommandResult; outcome: "inserted" | "exists" }> = [];
  private waitOps: WaitRow[] = [];
  private waitDeletes: string[] = [];
  private outboxOps: number[] = [];
  private dedupOps: Array<{ key: string; reaction_id: string; expires_at: string; outcome: "inserted" | "exists" }> = [];
  private deliveryOps: DeliveryLogEntry[] = [];
  private projectionOps: Array<{
    name: string;
    scope_id: string;
    aggregate_id?: string;
    seq: number;
    state: Record<string, unknown>;
  }> = [];
  private projectionAppliedOps: Array<{ name: string; seq: number; result: boolean }> = [];
  private reactionOps: ReactionSpec[] = [];
  private reactionQueueOps: ReactionQueueItem[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly readSnapshot: (id: string) => Aggregate | null,
    private readonly readCheckpoint: (id: string) => Checkpoint | null,
    private readonly readIdempotency: (command_id: string) => CommandResult | null,
    private readonly readWait: (wait_id: string) => WaitRow | null,
    private readonly readDedup: (fingerprint: string) => string | null,
    private readonly readProjectionApplied: (name: string, seq: number) => boolean,
  ) {}

  async appendJournal(draft: JournalEntryDraft): Promise<AllocatedSeq> {
    const seq = this.pendingNextSeq();
    const scope_seq = this.pendingScopeSeq(draft.scope_id);
    let aggregate_seq: number | undefined;
    if (draft.aggregate_id) {
      aggregate_seq = this.pendingAggregateSeq(draft.aggregate_id);
    }

    const committed: JournalEntry = { ...draft, seq, scope_seq, aggregate_seq };
    this.journalDrafts.push(committed);
    return { seq, scope_seq, aggregate_seq };
  }

  private pendingNextSeq(): number {
    const row = this.db.prepare("SELECT next_seq FROM seq_counter WHERE id = 1").get() as { next_seq: number };
    const allocated = row.next_seq + this.journalDrafts.length;
    return allocated;
  }

  private pendingScopeSeq(scope_id: string): number {
    const row = this.db
      .prepare("SELECT next_seq FROM scope_seq WHERE scope_id = ?")
      .get(scope_id) as { next_seq: number } | undefined;
    const base = row?.next_seq ?? 0;
    const pending = this.journalDrafts.filter((d) => d.scope_id === scope_id).length;
    return base + pending + 1;
  }

  private pendingAggregateSeq(aggregate_id: string): number {
    const row = this.db
      .prepare("SELECT next_seq FROM aggregate_seq WHERE aggregate_id = ?")
      .get(aggregate_id) as { next_seq: number } | undefined;
    const base = row?.next_seq ?? 0;
    const pending = this.journalDrafts.filter((d) => d.aggregate_id === aggregate_id).length;
    return base + pending + 1;
  }

  async upsertSnapshotIfRevision(
    aggregate: Aggregate,
    expectedRevision: number,
  ): Promise<"ok" | "conflict"> {
    const current = this.readSnapshot(aggregate.aggregate_id);
    const effectiveRevision = current?.revision ?? -1;
    if (effectiveRevision !== expectedRevision) {
      this.snapshotOps.push({ aggregate, expectedRevision, result: "conflict" });
      return "conflict";
    }
    this.snapshotOps.push({ aggregate, expectedRevision, result: "ok" });
    return "ok";
  }

  async getSnapshot(aggregate_id: string): Promise<Aggregate | null> {
    return this.readSnapshot(aggregate_id);
  }

  async upsertCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpointOps.push(checkpoint);
  }

  async getCheckpoint(checkpoint_id: string): Promise<Checkpoint | null> {
    return this.readCheckpoint(checkpoint_id);
  }

  async casCheckpointStatus(
    id: string,
    expected: CheckpointStatus,
    next: CheckpointStatus,
  ): Promise<boolean> {
    const current = this.readCheckpoint(id);
    if (!current || current.status !== expected) {
      this.checkpointCasOps.push({ id, expected, next, result: false });
      return false;
    }
    this.checkpointCasOps.push({ id, expected, next, result: true });
    return true;
  }

  async insertIdempotency(command_id: string, result: CommandResult): Promise<"inserted" | "exists"> {
    if (this.readIdempotency(command_id)) {
      this.idempotencyOps.push({ command_id, result, outcome: "exists" });
      return "exists";
    }
    this.idempotencyOps.push({ command_id, result, outcome: "inserted" });
    return "inserted";
  }

  async getIdempotency(command_id: string): Promise<CommandResult | null> {
    return this.readIdempotency(command_id);
  }

  async insertWait(row: WaitRow): Promise<void> {
    this.waitOps.push(row);
  }

  async getWait(wait_id: string): Promise<WaitRow | null> {
    return this.readWait(wait_id);
  }

  async updateWait(row: WaitRow): Promise<void> {
    this.waitOps.push(row);
  }

  async deleteWait(wait_id: string): Promise<void> {
    this.waitDeletes.push(wait_id);
  }

  async insertOutbox(seq: number): Promise<void> {
    this.outboxOps.push(seq);
  }

  async insertDedup(fingerprint: string, expires_at: string): Promise<"inserted" | "exists"> {
    const existing = this.readDedup(fingerprint);
    const now = new Date().toISOString();
    if (existing && existing > now) {
      this.dedupOps.push({ key: fingerprint, reaction_id: "", expires_at, outcome: "exists" });
      return "exists";
    }
    this.dedupOps.push({ key: fingerprint, reaction_id: "", expires_at, outcome: "inserted" });
    return "inserted";
  }

  async appendDeliveryLog(entry: DeliveryLogEntry): Promise<void> {
    this.deliveryOps.push(entry);
  }

  async upsertProjection(
    name: string,
    scope_id: string,
    aggregate_id: string | undefined,
    seq: number,
    state: Record<string, unknown>,
  ): Promise<void> {
    this.projectionOps.push({ name, scope_id, aggregate_id, seq, state });
  }

  async insertReaction(reaction: ReactionSpec): Promise<void> {
    this.reactionOps.push(reaction);
  }

  async enqueueReaction(item: ReactionQueueItem): Promise<void> {
    this.reactionQueueOps.push(item);
  }

  async tryMarkProjectionApplied(name: string, seq: number): Promise<boolean> {
    if (this.readProjectionApplied(name, seq)) {
      this.projectionAppliedOps.push({ name, seq, result: false });
      return false;
    }
    this.projectionAppliedOps.push({ name, seq, result: true });
    return true;
  }

  flush(): void {
    if (this.journalDrafts.length > 0) {
      const maxSeq = this.journalDrafts[this.journalDrafts.length - 1]!.seq;
      this.db.prepare("UPDATE seq_counter SET next_seq = ? WHERE id = 1").run(maxSeq + 1);

      const scopeCounts = new Map<string, number>();
      const aggCounts = new Map<string, number>();
      for (const entry of this.journalDrafts) {
        scopeCounts.set(entry.scope_id, entry.scope_seq ?? 0);
        if (entry.aggregate_id && entry.aggregate_seq) {
          aggCounts.set(entry.aggregate_id, entry.aggregate_seq);
        }
      }
      const upsertScope = this.db.prepare(
        "INSERT INTO scope_seq (scope_id, next_seq) VALUES (?, ?) ON CONFLICT(scope_id) DO UPDATE SET next_seq = excluded.next_seq",
      );
      for (const [scope_id, next_seq] of scopeCounts) upsertScope.run(scope_id, next_seq);

      const upsertAgg = this.db.prepare(
        "INSERT INTO aggregate_seq (aggregate_id, next_seq) VALUES (?, ?) ON CONFLICT(aggregate_id) DO UPDATE SET next_seq = excluded.next_seq",
      );
      for (const [aggregate_id, next_seq] of aggCounts) upsertAgg.run(aggregate_id, next_seq);
    }

    const insertJournal = this.db.prepare(`
      INSERT INTO journal_events (seq, entry_id, scope_id, aggregate_id, scope_seq, aggregate_seq, entry_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const entry of this.journalDrafts) {
      insertJournal.run(
        entry.seq,
        entry.entry_id,
        entry.scope_id,
        entry.aggregate_id ?? null,
        entry.scope_seq ?? 0,
        entry.aggregate_seq ?? null,
        toCanonicalJson(entry),
      );
    }

    const upsertSnapshot = this.db.prepare(`
      INSERT INTO aggregate_snapshots (aggregate_id, scope_id, revision, snapshot_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(aggregate_id) DO UPDATE SET revision = excluded.revision, snapshot_json = excluded.snapshot_json
    `);
    for (const op of this.snapshotOps) {
      if (op.result === "ok") {
        upsertSnapshot.run(
          op.aggregate.aggregate_id,
          op.aggregate.scope_id,
          op.aggregate.revision,
          toCanonicalJson(op.aggregate),
        );
      }
    }

    const upsertCheckpoint = this.db.prepare(`
      INSERT INTO checkpoints (checkpoint_id, aggregate_id, checkpoint_json)
      VALUES (?, ?, ?)
      ON CONFLICT(checkpoint_id) DO UPDATE SET checkpoint_json = excluded.checkpoint_json
    `);
    for (const cp of this.checkpointOps) {
      upsertCheckpoint.run(cp.checkpoint_id, cp.aggregate_id, toCanonicalJson(cp));
    }
    for (const cas of this.checkpointCasOps) {
      if (cas.result) {
        const cp = this.readCheckpoint(cas.id);
        if (cp) upsertCheckpoint.run(cas.id, cp.aggregate_id, toCanonicalJson({ ...cp, status: cas.next }));
      }
    }

    const insertIdem = this.db.prepare("INSERT OR IGNORE INTO idempotency (command_id, result_json) VALUES (?, ?)");
    for (const idem of this.idempotencyOps) {
      if (idem.outcome === "inserted") {
        insertIdem.run(idem.command_id, toCanonicalJson(idem.result));
      }
    }

    const upsertWait = this.db.prepare(`
      INSERT INTO waits (wait_id, scope_id, aggregate_id, status, wait_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wait_id) DO UPDATE SET status = excluded.status, wait_json = excluded.wait_json
    `);
    for (const wait of this.waitOps) {
      upsertWait.run(wait.wait_id, wait.scope_id, wait.aggregate_id ?? null, wait.status, toCanonicalJson(wait));
    }
    const deleteWait = this.db.prepare("DELETE FROM waits WHERE wait_id = ?");
    for (const id of this.waitDeletes) deleteWait.run(id);

    const insertOutbox = this.db.prepare(`
      INSERT INTO fanout_outbox (seq, processed_at, lease_owner, lease_expires_at, attempt_count, next_attempt_at, last_error)
      VALUES (?, NULL, NULL, NULL, 0, NULL, NULL)
    `);
    for (const seq of this.outboxOps) insertOutbox.run(seq);

    const insertDedup = this.db.prepare(
      "INSERT OR REPLACE INTO dedup_ledger (fingerprint, reaction_id, expires_at) VALUES (?, ?, ?)",
    );
    for (const dedup of this.dedupOps) {
      if (dedup.outcome === "inserted") {
        insertDedup.run(dedup.key, dedup.reaction_id || "unknown", dedup.expires_at);
      }
    }

    const insertDelivery = this.db.prepare(`
      INSERT OR REPLACE INTO delivery_log (entry_id, reaction_id, attempt_no, outcome, dedup_key, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const dl of this.deliveryOps) {
      insertDelivery.run(dl.entry_id, dl.reaction_id, dl.attempt_no, dl.outcome, dl.dedup_key, dl.ts);
    }

    const upsertProjection = this.db.prepare(`
      INSERT INTO projection_states (projection_key, name, scope_id, aggregate_id, seq, state_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(projection_key) DO UPDATE SET seq = excluded.seq, state_json = excluded.state_json
    `);
    for (const proj of this.projectionOps) {
      upsertProjection.run(
        projectionKey(proj.name, proj.scope_id, proj.aggregate_id),
        proj.name,
        proj.scope_id,
        proj.aggregate_id ?? null,
        proj.seq,
        toCanonicalJson(proj.state),
      );
    }

    const insertApplied = this.db.prepare(
      "INSERT OR IGNORE INTO projection_applied (name, seq) VALUES (?, ?)",
    );
    for (const applied of this.projectionAppliedOps) {
      if (applied.result) insertApplied.run(applied.name, applied.seq);
    }

    const upsertReaction = this.db.prepare(`
      INSERT INTO reactions (reaction_id, scope_id, enabled, reaction_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(reaction_id) DO UPDATE SET enabled = excluded.enabled, reaction_json = excluded.reaction_json
    `);
    for (const r of this.reactionOps) {
      upsertReaction.run(r.reaction_id, r.scope_id, r.enabled ? 1 : 0, toCanonicalJson(r));
    }

    const insertQueue = this.db.prepare(`
      INSERT INTO reaction_queue (queue_id, reaction_id, entry_id, partition_key, fingerprint, attempt_no, status, entry_json, enqueued_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);
    for (const item of this.reactionQueueOps) {
      insertQueue.run(
        item.queue_id,
        item.reaction_id,
        item.entry_id,
        item.partition_key,
        item.fingerprint,
        item.attempt_no,
        toCanonicalJson(item.entry),
        item.enqueued_at,
      );
    }
  }
}

export class SqlitePersistence implements PersistencePort {
  private readonly db: Database.Database;

  constructor(path: string = ":memory:") {
    this.db = new Database(path);
    migrate(this.db);
  }

  getDb(): Database.Database {
    return this.db;
  }

  private readSnapshot(aggregate_id: string): Aggregate | null {
    const row = this.db
      .prepare("SELECT snapshot_json FROM aggregate_snapshots WHERE aggregate_id = ?")
      .get(aggregate_id) as { snapshot_json: string } | undefined;
    return row ? fromJson<Aggregate>(row.snapshot_json) : null;
  }

  private readCheckpoint(checkpoint_id: string): Checkpoint | null {
    const row = this.db
      .prepare("SELECT checkpoint_json FROM checkpoints WHERE checkpoint_id = ?")
      .get(checkpoint_id) as { checkpoint_json: string } | undefined;
    return row ? fromJson<Checkpoint>(row.checkpoint_json) : null;
  }

  private readIdempotency(command_id: string): CommandResult | null {
    const row = this.db
      .prepare("SELECT result_json FROM idempotency WHERE command_id = ?")
      .get(command_id) as { result_json: string } | undefined;
    return row ? fromJson<CommandResult>(row.result_json) : null;
  }

  private readWait(wait_id: string): WaitRow | null {
    const row = this.db
      .prepare("SELECT wait_json FROM waits WHERE wait_id = ?")
      .get(wait_id) as { wait_json: string } | undefined;
    return row ? fromJson<WaitRow>(row.wait_json) : null;
  }

  private readDedup(fingerprint: string): string | null {
    const row = this.db
      .prepare("SELECT expires_at FROM dedup_ledger WHERE fingerprint = ?")
      .get(fingerprint) as { expires_at: string } | undefined;
    return row?.expires_at ?? null;
  }

  private readProjectionApplied(name: string, seq: number): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM projection_applied WHERE name = ? AND seq = ?")
      .get(name, seq);
    return !!row;
  }

  async runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = new SqliteTransaction(
      this.db,
      (id) => this.readSnapshot(id),
      (id) => this.readCheckpoint(id),
      (id) => this.readIdempotency(id),
      (id) => this.readWait(id),
      (fp) => this.readDedup(fp),
      (name, seq) => this.readProjectionApplied(name, seq),
    );
    try {
      const result = await fn(tx);
      const commit = this.db.transaction(() => tx.flush());
      commit();
      return result;
    } catch (err) {
      throw err;
    }
  }

  async tailJournal(from_seq = 0, limit = 1000): Promise<JournalEntry[]> {
    const rows = this.db
      .prepare("SELECT entry_json FROM journal_events WHERE seq > ? ORDER BY seq ASC LIMIT ?")
      .all(from_seq, limit) as Array<{ entry_json: string }>;
    return rows.map((r) => fromJson<JournalEntry>(r.entry_json));
  }

  async claimFanoutBatch(limit: number, worker_id: string, lease_ms: number): Promise<JournalEntry[]> {
    const now = new Date();
    const lease_expires = new Date(now.getTime() + lease_ms).toISOString();
    const nowIso = now.toISOString();

    const rows = this.db
      .prepare(`
        SELECT o.seq, j.entry_json
        FROM fanout_outbox o
        JOIN journal_events j ON j.seq = o.seq
        WHERE o.processed_at IS NULL
          AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
          AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= ? OR o.lease_owner = ?)
        ORDER BY o.seq ASC
        LIMIT ?
      `)
      .all(nowIso, nowIso, worker_id, limit) as Array<{ seq: number; entry_json: string }>;

    const claimed: JournalEntry[] = [];
    const update = this.db.prepare(`
      UPDATE fanout_outbox
      SET lease_owner = ?, lease_expires_at = ?, attempt_count = attempt_count + 1
      WHERE seq = ?
    `);
    for (const row of rows) {
      update.run(worker_id, lease_expires, row.seq);
      claimed.push(fromJson<JournalEntry>(row.entry_json));
    }
    return claimed;
  }

  async ackFanout(seq: number): Promise<void> {
    this.db
      .prepare(
        "UPDATE fanout_outbox SET processed_at = ?, lease_owner = NULL, lease_expires_at = NULL WHERE seq = ?",
      )
      .run(new Date().toISOString(), seq);
  }

  async failFanout(seq: number, error: string, retry_at: string): Promise<void> {
    this.db
      .prepare(
        "UPDATE fanout_outbox SET lease_owner = NULL, lease_expires_at = NULL, next_attempt_at = ?, last_error = ? WHERE seq = ?",
      )
      .run(retry_at, error, seq);
  }

  async getReaction(reaction_id: string): Promise<ReactionSpec | null> {
    const row = this.db
      .prepare("SELECT reaction_json FROM reactions WHERE reaction_id = ?")
      .get(reaction_id) as { reaction_json: string } | undefined;
    return row ? fromJson<ReactionSpec>(row.reaction_json) : null;
  }

  async listReactions(scope_id: string): Promise<ReactionSpec[]> {
    const rows = this.db
      .prepare("SELECT reaction_json FROM reactions WHERE scope_id = ? AND enabled = 1")
      .all(scope_id) as Array<{ reaction_json: string }>;
    return rows.map((r) => fromJson<ReactionSpec>(r.reaction_json));
  }

  async getProjection(
    name: string,
    scope_id: string,
    aggregate_id?: string,
  ): Promise<{ seq: number; state: Record<string, unknown> } | null> {
    const row = this.db
      .prepare("SELECT seq, state_json FROM projection_states WHERE projection_key = ?")
      .get(projectionKey(name, scope_id, aggregate_id)) as { seq: number; state_json: string } | undefined;
    return row ? { seq: row.seq, state: fromJson(row.state_json) } : null;
  }

  async getMaxSeq(): Promise<number> {
    const row = this.db.prepare("SELECT MAX(seq) as max_seq FROM journal_events").get() as {
      max_seq: number | null;
    };
    return row.max_seq ?? 0;
  }

  async listPendingWaits(scope_id: string, aggregate_id?: string): Promise<WaitRow[]> {
    const rows = this.db
      .prepare("SELECT wait_json FROM waits WHERE scope_id = ? AND status = 'pending'")
      .all(scope_id) as Array<{ wait_json: string }>;
    return rows
      .map((r) => fromJson<WaitRow>(r.wait_json))
      .filter((w) => !aggregate_id || w.aggregate_id === aggregate_id);
  }

  async listCheckpoints(aggregate_id: string): Promise<Checkpoint[]> {
    const rows = this.db
      .prepare("SELECT checkpoint_json FROM checkpoints WHERE aggregate_id = ?")
      .all(aggregate_id) as Array<{ checkpoint_json: string }>;
    return rows.map((r) => fromJson<Checkpoint>(r.checkpoint_json));
  }

  async claimReactionBatch(limit: number): Promise<ReactionQueueItem[]> {
    const rows = this.db
      .prepare(
        "SELECT queue_id, reaction_id, entry_id, partition_key, fingerprint, attempt_no, entry_json, enqueued_at FROM reaction_queue WHERE status = 'pending' ORDER BY enqueued_at ASC LIMIT ?",
      )
      .all(limit) as Array<{
      queue_id: string;
      reaction_id: string;
      entry_id: string;
      partition_key: string;
      fingerprint: string;
      attempt_no: number;
      entry_json: string;
      enqueued_at: string;
    }>;

    const update = this.db.prepare("UPDATE reaction_queue SET status = 'processing' WHERE queue_id = ?");
    const items: ReactionQueueItem[] = [];
    for (const row of rows) {
      update.run(row.queue_id);
      items.push({
        queue_id: row.queue_id,
        reaction_id: row.reaction_id,
        entry_id: row.entry_id,
        partition_key: row.partition_key,
        fingerprint: row.fingerprint,
        attempt_no: row.attempt_no,
        entry: fromJson(row.entry_json),
        enqueued_at: row.enqueued_at,
      });
    }
    return items;
  }

  async completeReaction(queue_id: string, delivery: DeliveryLogEntry): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT OR REPLACE INTO delivery_log (entry_id, reaction_id, attempt_no, outcome, dedup_key, ts) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          delivery.entry_id,
          delivery.reaction_id,
          delivery.attempt_no,
          delivery.outcome,
          delivery.dedup_key,
          delivery.ts,
        );
      this.db.prepare("UPDATE reaction_queue SET status = 'done' WHERE queue_id = ?").run(queue_id);
    });
    tx();
  }

  async acquireProjectionLock(name: string, owner: string, lease_ms: number): Promise<boolean> {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + lease_ms).toISOString();
    const existing = this.db
      .prepare("SELECT owner, expires_at FROM projection_locks WHERE name = ?")
      .get(name) as { owner: string; expires_at: string } | undefined;
    if (existing && existing.expires_at > now && existing.owner !== owner) return false;
    this.db
      .prepare(
        "INSERT INTO projection_locks (name, owner, expires_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at",
      )
      .run(name, owner, expires);
    return true;
  }

  async releaseProjectionLock(name: string, owner: string): Promise<void> {
    this.db
      .prepare("DELETE FROM projection_locks WHERE name = ? AND owner = ?")
      .run(name, owner);
  }

  async getProjectionCursor(name: string): Promise<number> {
    const row = this.db
      .prepare("SELECT last_seq FROM projection_cursors WHERE name = ?")
      .get(name) as { last_seq: number } | undefined;
    return row?.last_seq ?? 0;
  }

  async setProjectionCursor(name: string, last_seq: number): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO projection_cursors (name, last_seq, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at",
      )
      .run(name, last_seq, new Date().toISOString());
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export function createSqlitePersistence(path?: string): SqlitePersistence {
  return new SqlitePersistence(path);
}
