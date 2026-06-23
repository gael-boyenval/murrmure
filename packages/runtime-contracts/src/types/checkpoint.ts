import type { CheckpointStatus } from "./primitives.js";

export interface CheckpointVote {
  actor_id: string;
  decision: "approved" | "rejected";
  ts: string;
}

export interface CheckpointQuorum {
  mode: "any" | "all" | "count";
  count: number;
  assignees: string[];
}

export interface Checkpoint {
  checkpoint_id: string;
  aggregate_id: string;
  scope_id: string;
  transition_id: string;
  from_state: string;
  to_state: string;
  status: CheckpointStatus;
  quorum: CheckpointQuorum;
  votes: CheckpointVote[];
  created_at: string;
  resolved_at?: string;
}
