import type { Aggregate } from "./aggregate.js";
import type { Checkpoint } from "./checkpoint.js";
import type { CommandResult } from "./command-result.js";
import type { Outcome } from "./primitives.js";

export interface ExecutionResult {
  outcome: Outcome;
  journal_type: string;
  payload: Record<string, unknown>;
  aggregate_patch?: Partial<Aggregate> & { revision: number };
  checkpoint?: Checkpoint;
  denial?: CommandResult;
}
