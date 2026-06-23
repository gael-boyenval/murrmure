import type {
  Aggregate,
  Checkpoint,
  CheckpointStatus,
  CommandResult,
  DeliveryLogEntry,
  FanoutOutboxRow,
  JournalEntry,
  JournalEntryDraft,
  PersistencePort,
  ReactionQueueItem,
  ReactionSpec,
  Transaction,
  AllocatedSeq,
  WaitRow,
} from "@murrmure/runtime-contracts";

export interface MemoryStoreState {
  journal: JournalEntry[];
  snapshots: Map<string, Aggregate>;
  checkpoints: Map<string, Checkpoint>;
  idempotency: Map<string, CommandResult>;
  waits: Map<string, WaitRow>;
  dedup: Map<string, string>;
  deliveryLog: DeliveryLogEntry[];
  projections: Map<string, { seq: number; state: Record<string, unknown> }>;
  reactions: Map<string, ReactionSpec>;
  outbox: Map<number, FanoutOutboxRow>;
  nextSeq: number;
  scopeSeq: Map<string, number>;
  aggregateSeq: Map<string, number>;
  reactionQueue: ReactionQueueItem[];
  reactionQueueClaimed: Set<string>;
  projectionApplied: Set<string>;
  projectionCursors: Map<string, number>;
  projectionLocks: Map<string, { owner: string; expires_at: string }>;
}

export function createMemoryStoreState(): MemoryStoreState {
  return {
    journal: [],
    snapshots: new Map(),
    checkpoints: new Map(),
    idempotency: new Map(),
    waits: new Map(),
    dedup: new Map(),
    deliveryLog: [],
    projections: new Map(),
    reactions: new Map(),
    outbox: new Map(),
    nextSeq: 1,
    scopeSeq: new Map(),
    aggregateSeq: new Map(),
    reactionQueue: [],
    reactionQueueClaimed: new Set(),
    projectionApplied: new Set(),
    projectionCursors: new Map(),
    projectionLocks: new Map(),
  };
}

function projectionKey(name: string, scope_id: string, aggregate_id?: string): string {
  return `${name}:${scope_id}:${aggregate_id ?? "_"}`;
}

class MemoryTransaction implements Transaction {
  private journalDrafts: JournalEntry[] = [];
  private snapshotOps: Array<{ aggregate: Aggregate; expectedRevision: number }> = [];
  private checkpointOps: Checkpoint[] = [];
  private checkpointCasOps: Array<{
    id: string;
    expected: CheckpointStatus;
    next: CheckpointStatus;
    result: boolean;
  }> = [];
  private idempotencyOps: Array<{ command_id: string; result: CommandResult; outcome: "inserted" | "exists" }> =
    [];
  private waitOps: WaitRow[] = [];
  private outboxOps: number[] = [];
  private dedupOps: Array<{ key: string; expires_at: string; outcome: "inserted" | "exists" }> = [];
  private deliveryOps: DeliveryLogEntry[] = [];
  private projectionOps: Array<{
    name: string;
    scope_id: string;
    aggregate_id?: string;
    seq: number;
    state: Record<string, unknown>;
  }> = [];
  private reactionOps: ReactionSpec[] = [];
  private reactionQueueOps: ReactionQueueItem[] = [];
  private projectionAppliedOps: Array<{ name: string; seq: number; result: boolean }> = [];

  constructor(private readonly state: MemoryStoreState) {}

  async appendJournal(draft: JournalEntryDraft): Promise<AllocatedSeq> {
    const seq = this.state.nextSeq++;
    const scope_seq = (this.state.scopeSeq.get(draft.scope_id) ?? 0) + 1;
    this.state.scopeSeq.set(draft.scope_id, scope_seq);
    let aggregate_seq: number | undefined;
    if (draft.aggregate_id) {
      aggregate_seq = (this.state.aggregateSeq.get(draft.aggregate_id) ?? 0) + 1;
      this.state.aggregateSeq.set(draft.aggregate_id, aggregate_seq);
    }
    const committed: JournalEntry = { ...draft, seq, scope_seq, aggregate_seq };
    this.journalDrafts.push(committed);
    return { seq, scope_seq, aggregate_seq };
  }

  async upsertSnapshotIfRevision(
    aggregate: Aggregate,
    expectedRevision: number,
  ): Promise<"ok" | "conflict"> {
    const current = this.state.snapshots.get(aggregate.aggregate_id);
    const effectiveRevision = current?.revision ?? -1;
    if (effectiveRevision !== expectedRevision) return "conflict";
    this.snapshotOps.push({ aggregate, expectedRevision });
    return "ok";
  }

  async getSnapshot(aggregate_id: string): Promise<Aggregate | null> {
    return this.state.snapshots.get(aggregate_id) ?? null;
  }

  async upsertCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpointOps.push(checkpoint);
  }

  async getCheckpoint(checkpoint_id: string): Promise<Checkpoint | null> {
    return this.state.checkpoints.get(checkpoint_id) ?? null;
  }

  async casCheckpointStatus(
    id: string,
    expected: CheckpointStatus,
    next: CheckpointStatus,
  ): Promise<boolean> {
    const current = this.state.checkpoints.get(id);
    if (!current || current.status !== expected) {
      this.checkpointCasOps.push({ id, expected, next, result: false });
      return false;
    }
    this.checkpointCasOps.push({ id, expected, next, result: true });
    return true;
  }

  async insertIdempotency(command_id: string, result: CommandResult): Promise<"inserted" | "exists"> {
    if (this.state.idempotency.has(command_id)) {
      this.idempotencyOps.push({ command_id, result, outcome: "exists" });
      return "exists";
    }
    this.idempotencyOps.push({ command_id, result, outcome: "inserted" });
    return "inserted";
  }

  async getIdempotency(command_id: string): Promise<CommandResult | null> {
    return this.state.idempotency.get(command_id) ?? null;
  }

  async insertWait(row: WaitRow): Promise<void> {
    this.waitOps.push(row);
  }

  async getWait(wait_id: string): Promise<WaitRow | null> {
    return this.state.waits.get(wait_id) ?? null;
  }

  async updateWait(row: WaitRow): Promise<void> {
    this.waitOps.push(row);
  }

  async deleteWait(wait_id: string): Promise<void> {
    this.state.waits.delete(wait_id);
  }

  async insertOutbox(seq: number): Promise<void> {
    this.outboxOps.push(seq);
  }

  async insertDedup(key: string, expires_at: string): Promise<"inserted" | "exists"> {
    const existing = this.state.dedup.get(key);
    if (existing && existing > new Date().toISOString()) {
      this.dedupOps.push({ key, expires_at, outcome: "exists" });
      return "exists";
    }
    this.dedupOps.push({ key, expires_at, outcome: "inserted" });
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
    const key = `${name}:${seq}`;
    const applied = (this.state as MemoryStoreState & { projectionApplied: Set<string> }).projectionApplied;
    if (applied.has(key)) {
      this.projectionAppliedOps.push({ name, seq, result: false });
      return false;
    }
    this.projectionAppliedOps.push({ name, seq, result: true });
    return true;
  }

  commit(): void {
    for (const entry of this.journalDrafts) {
      this.state.journal.push(entry);
    }
    for (const op of this.snapshotOps) {
      this.state.snapshots.set(op.aggregate.aggregate_id, op.aggregate);
    }
    for (const cp of this.checkpointOps) {
      this.state.checkpoints.set(cp.checkpoint_id, cp);
    }
    for (const cas of this.checkpointCasOps) {
      if (cas.result) {
        const cp = this.state.checkpoints.get(cas.id);
        if (cp) this.state.checkpoints.set(cas.id, { ...cp, status: cas.next });
      }
    }
    for (const idem of this.idempotencyOps) {
      if (idem.outcome === "inserted") this.state.idempotency.set(idem.command_id, idem.result);
    }
    for (const wait of this.waitOps) {
      this.state.waits.set(wait.wait_id, wait);
    }
    for (const seq of this.outboxOps) {
      this.state.outbox.set(seq, {
        seq,
        processed_at: null,
        lease_owner: null,
        lease_expires_at: null,
        attempt_count: 0,
        next_attempt_at: null,
        last_error: null,
      });
    }
    for (const dedup of this.dedupOps) {
      if (dedup.outcome === "inserted") this.state.dedup.set(dedup.key, dedup.expires_at);
    }
    for (const dl of this.deliveryOps) {
      this.state.deliveryLog.push(dl);
    }
    for (const proj of this.projectionOps) {
      const key = projectionKey(proj.name, proj.scope_id, proj.aggregate_id);
      const existing = this.state.projections.get(key);
      if (!existing || proj.seq >= existing.seq) {
        this.state.projections.set(key, { seq: proj.seq, state: proj.state });
      }
    }
    for (const r of this.reactionOps) {
      this.state.reactions.set(r.reaction_id, r);
    }
    for (const item of this.reactionQueueOps) {
      this.state.reactionQueue.push(item);
    }
    for (const applied of this.projectionAppliedOps) {
      if (applied.result) this.state.projectionApplied.add(`${applied.name}:${applied.seq}`);
    }
  }

  rollback(): void {
    for (const entry of this.journalDrafts) {
      this.state.nextSeq = Math.min(this.state.nextSeq, entry.seq);
    }
  }
}

export class InMemoryPersistence implements PersistencePort {
  constructor(private readonly state: MemoryStoreState = createMemoryStoreState()) {}

  getState(): MemoryStoreState {
    return this.state;
  }

  async runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = new MemoryTransaction(this.state);
    try {
      const result = await fn(tx);
      (tx as MemoryTransaction).commit();
      return result;
    } catch (err) {
      (tx as MemoryTransaction).rollback();
      throw err;
    }
  }

  async tailJournal(from_seq = 0, limit = 1000): Promise<JournalEntry[]> {
    return this.state.journal.filter((e) => e.seq > from_seq).slice(0, limit);
  }

  async claimFanoutBatch(limit: number, worker_id: string, lease_ms: number): Promise<JournalEntry[]> {
    const now = new Date();
    const lease_expires = new Date(now.getTime() + lease_ms).toISOString();
    const claimed: JournalEntry[] = [];

    for (const [seq, row] of this.state.outbox) {
      if (claimed.length >= limit) break;
      if (row.processed_at) continue;
      if (row.lease_expires_at && row.lease_expires_at > now.toISOString() && row.lease_owner !== worker_id) {
        continue;
      }
      const entry = this.state.journal.find((e) => e.seq === seq);
      if (!entry) continue;
      this.state.outbox.set(seq, {
        ...row,
        lease_owner: worker_id,
        lease_expires_at: lease_expires,
        attempt_count: row.attempt_count + 1,
      });
      claimed.push(entry);
    }
    return claimed;
  }

  async ackFanout(seq: number): Promise<void> {
    const row = this.state.outbox.get(seq);
    if (row) {
      this.state.outbox.set(seq, {
        ...row,
        processed_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      });
    }
  }

  async failFanout(seq: number, error: string, retry_at: string): Promise<void> {
    const row = this.state.outbox.get(seq);
    if (row) {
      this.state.outbox.set(seq, {
        ...row,
        lease_owner: null,
        lease_expires_at: null,
        next_attempt_at: retry_at,
        last_error: error,
      });
    }
  }

  async getReaction(reaction_id: string): Promise<ReactionSpec | null> {
    return this.state.reactions.get(reaction_id) ?? null;
  }

  async listReactions(scope_id: string): Promise<ReactionSpec[]> {
    return [...this.state.reactions.values()].filter((r) => r.scope_id === scope_id && r.enabled);
  }

  async getProjection(
    name: string,
    scope_id: string,
    aggregate_id?: string,
  ): Promise<{ seq: number; state: Record<string, unknown> } | null> {
    return this.state.projections.get(projectionKey(name, scope_id, aggregate_id)) ?? null;
  }

  async getMaxSeq(): Promise<number> {
    return this.state.journal.at(-1)?.seq ?? 0;
  }

  async listPendingWaits(scope_id: string, aggregate_id?: string): Promise<WaitRow[]> {
    return [...this.state.waits.values()].filter(
      (w) => w.scope_id === scope_id && w.status === "pending" && (!aggregate_id || w.aggregate_id === aggregate_id),
    );
  }

  async listCheckpoints(aggregate_id: string): Promise<Checkpoint[]> {
    return [...this.state.checkpoints.values()].filter((c) => c.aggregate_id === aggregate_id);
  }

  async claimReactionBatch(limit: number): Promise<ReactionQueueItem[]> {
    const batch = this.state.reactionQueue
      .filter((q) => !this.state.reactionQueueClaimed.has(q.queue_id))
      .slice(0, limit);
    for (const item of batch) this.state.reactionQueueClaimed.add(item.queue_id);
    return batch;
  }

  async completeReaction(queue_id: string, delivery: DeliveryLogEntry): Promise<void> {
    this.state.deliveryLog.push(delivery);
    const idx = this.state.reactionQueue.findIndex((q) => q.queue_id === queue_id);
    if (idx >= 0) this.state.reactionQueue.splice(idx, 1);
    this.state.reactionQueueClaimed.delete(queue_id);
  }

  async acquireProjectionLock(name: string, owner: string, lease_ms: number): Promise<boolean> {
    const now = new Date().toISOString();
    const existing = this.state.projectionLocks.get(name);
    if (existing && existing.expires_at > now && existing.owner !== owner) return false;
    this.state.projectionLocks.set(name, {
      owner,
      expires_at: new Date(Date.now() + lease_ms).toISOString(),
    });
    return true;
  }

  async releaseProjectionLock(name: string, owner: string): Promise<void> {
    const lock = this.state.projectionLocks.get(name);
    if (lock?.owner === owner) this.state.projectionLocks.delete(name);
  }

  async getProjectionCursor(name: string): Promise<number> {
    return this.state.projectionCursors.get(name) ?? 0;
  }

  async setProjectionCursor(name: string, last_seq: number): Promise<void> {
    this.state.projectionCursors.set(name, last_seq);
  }

  async close(): Promise<void> {}
}
