import type { Outcome } from "./primitives.js";

export interface JournalDenial {
  code: string;
  message: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}

export interface JournalEntryDraft {
  entry_id: string;
  kind: "command" | "event" | "system";
  outcome: Outcome;
  scope_id: string;
  aggregate_id?: string;
  actor_id: string;
  credential_id: string;
  command_id?: string;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
  payload_ref?: string;
  ext?: Record<string, unknown>;
  denial?: JournalDenial;
  causation?: { entry_id: string };
  correlation?: { command_id: string };
}

export interface JournalEntry extends JournalEntryDraft {
  seq: number;
  scope_seq?: number;
  aggregate_seq?: number;
}

export interface AllocatedSeq {
  seq: number;
  scope_seq?: number;
  aggregate_seq?: number;
}
