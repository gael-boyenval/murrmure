import type { Aggregate } from "../types/aggregate.js";

export interface ConvergencePort {
  evaluate(
    rules: unknown[],
    ctx: { aggregate: Aggregate; state: string },
  ): Promise<{ emit?: string[] }>;
}
