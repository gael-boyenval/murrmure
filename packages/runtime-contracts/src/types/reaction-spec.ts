export interface ActionSpec {
  type: string;
  config: Record<string, unknown>;
}

export interface ReactionSpec {
  reaction_id: string;
  scope_id: string;
  registered_at_seq: number;
  filter: {
    entry_types?: string[];
    source_scope_id?: string;
    aggregate_id?: string;
  };
  action: ActionSpec;
  dedup: {
    required: boolean;
    key_extractor: "entry_id" | "json_path" | "custom";
    key_path?: string;
    window_seconds: number;
  };
  partition: { key: "scope" | "aggregate" | "scope:aggregate" | "reaction" };
  enabled: boolean;
}

export type ReactionSpecInput = Omit<ReactionSpec, "registered_at_seq" | "enabled">;

export interface DeliveryLogEntry {
  entry_id: string;
  reaction_id: string;
  attempt_no: number;
  dedup_key: string;
  outcome: "delivered" | "dedup_skipped" | "failed";
  ts: string;
}

export interface ReactionQueueItem {
  queue_id: string;
  reaction_id: string;
  entry_id: string;
  partition_key: string;
  fingerprint: string;
  attempt_no: number;
  entry: import("./journal-entry.js").JournalEntry;
  enqueued_at: string;
}
