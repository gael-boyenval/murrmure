import type { Aggregate } from "../types/aggregate.js";
import type { Provenance } from "../types/provenance.js";

export type PolicyPhase = "pre_load" | "post_load";

export interface CommandContext extends Provenance {
  command_kind: string;
  payload?: Record<string, unknown>;
  phase?: PolicyPhase;
  aggregate_snapshot?: Aggregate;
}

export interface PolicyResult {
  allowed: boolean;
  denial?: { code: string; message: string; retryable: boolean };
}

export interface PolicyPort {
  evaluate(ctx: CommandContext): Promise<PolicyResult>;
}
