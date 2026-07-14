import type { RunLifecycle } from "@murrmure/contracts";
import { FLOW_CONCURRENCY_LIMIT, SPACE_HAS_ACTIVE_RUNS } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";

/**
 * Atomic run-capacity admission and apply-quiescence checks.
 *
 * Every start path (manual, trigger, API, MCP, federated) funnels through one
 * admission check. A flow with a `max_concurrent_runs` policy is admitted only
 * while its non-terminal run count is below the limit; overflow returns
 * `FLOW_CONCURRENCY_LIMIT` with the canonical flow identity, the configured
 * limit, and the active blocking run ids — never a queue or partial run.
 *
 * Apply quiescence: an apply may replace a space's configuration only when the
 * whole space has no non-terminal runs; otherwise `SPACE_HAS_ACTIVE_RUNS`.
 *
 * Both checks are meant to run inside the per-space `SpaceConcurrencyGuard` so
 * the count+insert (start) and the quiescence+commit (apply) are atomic.
 */

/** Non-terminal run lifecycles — these block admission and apply. */
export const NON_TERMINAL_LIFECYCLES: RunLifecycle[] = ["working", "input-required"];

export interface FlowAdmissionError {
  code: typeof FLOW_CONCURRENCY_LIMIT;
  message: string;
  flow_id: string;
  flow_name: string;
  origin_space_id: string;
  flow_digest: string;
  max_concurrent_runs: number;
  active_run_ids: string[];
}

export interface SpaceApplyQuiescenceError {
  code: typeof SPACE_HAS_ACTIVE_RUNS;
  message: string;
  active_run_ids: string[];
}

function bare(id: string): string {
  return id.startsWith("spc_") ? id.slice(4) : id;
}

function prefixedRun(runId: string): string {
  return runId.startsWith("run_") ? runId : `run_${runId}`;
}

export interface FlowAdmissionInput {
  space_id: string;
  flow_id: string;
}

export type FlowAdmissionResult =
  | { ok: true; max_concurrent_runs?: number }
  | { ok: false; error: FlowAdmissionError };

/**
 * Check run capacity for a flow start. `ok` means the start may proceed (the
 * caller must still insert the run inside the same guard section). No policy =
 * unlimited = always `ok`. Overflow returns the active blocking run ids.
 */
export async function admitFlowRun(
  studio: StudioPersistencePort,
  input: FlowAdmissionInput,
): Promise<FlowAdmissionResult> {
  const spaceBare = bare(input.space_id);
  const policies = await studio.listIndexedRunPolicies(spaceBare);
  const policy = policies.find((p) => p.flow_id === input.flow_id);
  if (!policy) return { ok: true };

  const active = await studio.listRuns({
    space_id: spaceBare,
    flow_id: input.flow_id,
    lifecycles: NON_TERMINAL_LIFECYCLES,
    limit: policy.max_concurrent_runs,
  });

  if (active.length >= policy.max_concurrent_runs) {
    return {
      ok: false,
      error: {
        code: FLOW_CONCURRENCY_LIMIT,
        message: `Flow '${policy.flow}' is at capacity (${policy.max_concurrent_runs} concurrent run${policy.max_concurrent_runs === 1 ? "" : "s"} allowed)`,
        flow_id: policy.flow_id,
        flow_name: policy.flow,
        origin_space_id: policy.origin_space_id,
        flow_digest: policy.flow_digest,
        max_concurrent_runs: policy.max_concurrent_runs,
        active_run_ids: active.map((run) => prefixedRun(run.run_id)),
      },
    };
  }

  return { ok: true, max_concurrent_runs: policy.max_concurrent_runs };
}

export type SpaceApplyQuiescenceResult =
  | { ok: true }
  | { ok: false; error: SpaceApplyQuiescenceError };

/**
 * Assert that a space has no non-terminal runs, so an apply may safely replace
 * its configuration. Returns the blocking run ids on failure.
 */
export async function assertSpaceQuiescent(
  studio: StudioPersistencePort,
  space_id: string,
): Promise<SpaceApplyQuiescenceResult> {
  const spaceBare = bare(space_id);
  const active = await studio.listRuns({
    space_id: spaceBare,
    lifecycles: NON_TERMINAL_LIFECYCLES,
    limit: 1000,
  });
  if (active.length === 0) return { ok: true };
  return {
    ok: false,
    error: {
      code: SPACE_HAS_ACTIVE_RUNS,
      message: `Space has ${active.length} non-terminal run${active.length === 1 ? "" : "s"}; apply cannot replace configuration until they terminate`,
      active_run_ids: active.map((run) => prefixedRun(run.run_id)),
    },
  };
}
