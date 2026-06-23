import type { AggregateStatus } from "./primitives.js";
import type { RuleRef } from "./rule-ref.js";

export interface Aggregate {
  aggregate_id: string;
  scope_id: string;
  rule_ref: RuleRef;
  state: string;
  metadata: Record<string, unknown>;
  revision: number;
  status: AggregateStatus;
  created_at: string;
  updated_at: string;
}
