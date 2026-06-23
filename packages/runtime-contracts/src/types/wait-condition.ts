export type WaitCondition =
  | { type: "state"; state: string }
  | { type: "entry"; entry_type: string; match?: Record<string, unknown> }
  | {
      type: "checkpoint";
      checkpoint_id?: string;
      resolution?: "approved" | "rejected";
    }
  | { type: "artifact"; rule_set_key: string; min_version?: string }
  | { type: "compound"; all_of?: WaitCondition[]; any_of?: WaitCondition[] };

export interface WaitRow {
  wait_id: string;
  scope_id: string;
  aggregate_id?: string;
  condition: WaitCondition;
  delivery_mode: "in_process";
  bound_command_id?: string;
  status: "pending" | "resolved" | "cancelled" | "timed_out";
  registered_at_seq: number;
  expires_at?: string;
  created_at: string;
}

export interface WaitResolution {
  wait_id: string;
  status: "matched" | "denied" | "timed_out";
  entry?: import("./journal-entry.js").JournalEntry;
  denial?: import("./command-result.js").CommandResult;
}
