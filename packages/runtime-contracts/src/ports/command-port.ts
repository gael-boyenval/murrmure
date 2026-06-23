import type { KernelCommand } from "../types/kernel-command.js";
import type { CommandResult } from "../types/command-result.js";
import type { Aggregate } from "../types/aggregate.js";
import type { Checkpoint } from "../types/checkpoint.js";
import type { JournalEntry } from "../types/journal-entry.js";

export interface CommandPort {
  execute(command: KernelCommand): Promise<CommandResult>;
}

export interface QueryPort {
  getAggregate(aggregate_id: string): Promise<Aggregate | null>;
  tailJournal(from_seq: number, limit?: number): Promise<JournalEntry[]>;
  listCheckpoints(aggregate_id: string): Promise<Checkpoint[]>;
  getWait(wait_id: string): Promise<import("../types/wait-condition.js").WaitRow | null>;
  getProjection(
    name: string,
    scope_id: string,
    aggregate_id?: string,
  ): Promise<Record<string, unknown> | null>;
}
