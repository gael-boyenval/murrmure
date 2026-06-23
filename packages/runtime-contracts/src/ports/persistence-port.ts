import type { Aggregate } from "../types/aggregate.js";
import type { Checkpoint } from "../types/checkpoint.js";
import type { CheckpointStatus } from "../types/primitives.js";
import type { CommandResult } from "../types/command-result.js";
import type { DeliveryLogEntry, ReactionQueueItem } from "../types/reaction-spec.js";
import type { ReactionSpec } from "../types/reaction-spec.js";
import type {
  AllocatedSeq,
  JournalEntry,
  JournalEntryDraft,
} from "../types/journal-entry.js";
import type { WaitRow } from "../types/wait-condition.js";

export interface FanoutOutboxRow {
  seq: number;
  processed_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
}

export interface Transaction {
  appendJournal(draft: JournalEntryDraft): Promise<AllocatedSeq>;
  upsertSnapshotIfRevision(
    aggregate: Aggregate,
    expectedRevision: number,
  ): Promise<"ok" | "conflict">;
  getSnapshot(aggregate_id: string): Promise<Aggregate | null>;
  upsertCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(checkpoint_id: string): Promise<Checkpoint | null>;
  casCheckpointStatus(
    checkpoint_id: string,
    expected: CheckpointStatus,
    next: CheckpointStatus,
  ): Promise<boolean>;
  insertIdempotency(command_id: string, result: CommandResult): Promise<"inserted" | "exists">;
  getIdempotency(command_id: string): Promise<CommandResult | null>;
  insertWait(row: WaitRow): Promise<void>;
  getWait(wait_id: string): Promise<WaitRow | null>;
  updateWait(row: WaitRow): Promise<void>;
  deleteWait(wait_id: string): Promise<void>;
  insertOutbox(seq: number): Promise<void>;
  insertDedup(fingerprint: string, expires_at: string): Promise<"inserted" | "exists">;
  appendDeliveryLog(entry: DeliveryLogEntry): Promise<void>;
  upsertProjection(
    name: string,
    scope_id: string,
    aggregate_id: string | undefined,
    seq: number,
    state: Record<string, unknown>,
  ): Promise<void>;
  insertReaction(reaction: ReactionSpec): Promise<void>;
  enqueueReaction(item: ReactionQueueItem): Promise<void>;
  tryMarkProjectionApplied(name: string, seq: number): Promise<boolean>;
}

export interface PersistencePort {
  runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  tailJournal(from_seq: number, limit?: number): Promise<JournalEntry[]>;
  claimFanoutBatch(limit: number, worker_id: string, lease_ms: number): Promise<JournalEntry[]>;
  ackFanout(seq: number): Promise<void>;
  failFanout(seq: number, error: string, retry_at: string): Promise<void>;
  getReaction(reaction_id: string): Promise<ReactionSpec | null>;
  listReactions(scope_id: string): Promise<ReactionSpec[]>;
  getProjection(
    name: string,
    scope_id: string,
    aggregate_id?: string,
  ): Promise<{ seq: number; state: Record<string, unknown> } | null>;
  getMaxSeq(): Promise<number>;
  listPendingWaits(scope_id: string, aggregate_id?: string): Promise<WaitRow[]>;
  listCheckpoints(aggregate_id: string): Promise<Checkpoint[]>;
  claimReactionBatch(limit: number): Promise<ReactionQueueItem[]>;
  completeReaction(queue_id: string, delivery: DeliveryLogEntry): Promise<void>;
  acquireProjectionLock(name: string, owner: string, lease_ms: number): Promise<boolean>;
  releaseProjectionLock(name: string, owner: string): Promise<void>;
  getProjectionCursor(name: string): Promise<number>;
  setProjectionCursor(name: string, last_seq: number): Promise<void>;
  close(): Promise<void>;
}
