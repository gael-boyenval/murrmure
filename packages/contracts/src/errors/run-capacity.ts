/**
 * Typed run-capacity and apply-quiescence error codes.
 *
 * These are shared by every start path (manual, trigger, API, MCP, federated)
 * and by apply, so clients receive one consistent denial vocabulary. See
 * `studio-specs/current/bridges/handlers.md` and `flow-engine.md`.
 */

/** A flow start exceeded its `max_concurrent_runs` capacity (HTTP 409). */
export const FLOW_CONCURRENCY_LIMIT = "FLOW_CONCURRENCY_LIMIT";

/** An apply cannot replace configuration while a non-terminal run exists (HTTP 409). */
export const SPACE_HAS_ACTIVE_RUNS = "SPACE_HAS_ACTIVE_RUNS";

/** `run_policies` references an unknown or stale flow alias (apply hard-fail). */
export const RUN_POLICY_UNKNOWN_FLOW = "RUN_POLICY_UNKNOWN_FLOW";

/** `run_policies` references a duplicate/ambiguous flow name (apply hard-fail). */
export const RUN_POLICY_AMBIGUOUS_FLOW = "RUN_POLICY_AMBIGUOUS_FLOW";

/** `run_policies` has duplicate entries for one canonical flow (apply hard-fail). */
export const RUN_POLICY_DUPLICATE = "RUN_POLICY_DUPLICATE";

export const RUN_CAPACITY_ERROR_CODES = {
  FLOW_CONCURRENCY_LIMIT,
  SPACE_HAS_ACTIVE_RUNS,
  RUN_POLICY_UNKNOWN_FLOW,
  RUN_POLICY_AMBIGUOUS_FLOW,
  RUN_POLICY_DUPLICATE,
} as const;
