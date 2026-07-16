import { join } from "node:path";

/**
 * Canonical local run-scratch path helper.
 *
 * `.mrmr/dev/runs/{run_id}/` is the only local run-scratch root. Every scratch,
 * artifact, transfer, and intermediate execution-output path includes `run_id`
 * so concurrent runs in one space use disjoint trees. See
 * [run-scratch-path-normalize](../../../plans/2026-07-10-run-scratch-path-normalize.md)
 * and ADR-014.
 *
 * All paths returned here are **absolute** (joined to `space_root`) and are the
 * only constructors for run-scratch locations; `step-artifacts.ts`,
 * `step-contract-slice.ts`, and shell dispatch consume them.
 */

/** Strip an optional `run_` prefix. */
export function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

/** Ensure a run id carries the `run_` prefix used on disk. */
export function prefixedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}
export interface RunScratchPaths {
  space_root: string;
  /** `{space_root}/.mrmr/dev/runs/{run_id}` */
  run_dir: string;
  /** `{run_dir}/active-step-contract.json` */
  active_contract_path: string;
  /** `{run_dir}/steps/{step_id}/work` — present when `step_id` is supplied. */
  workdir?: string;
  /** `{run_dir}/steps/{step_id}` — promoted artifact root; present when `step_id` is supplied. */
  stable_dir?: string;
  /** `{run_dir}/steps/{step_id}/inputs` — verified local consumer copies; present when `step_id` is supplied. */
  inputs_dir?: string;
}

/** Relative run-scratch root: `.mrmr/dev/runs/{run_id}` (run_id is normalized to `run_…`). */
export function runScratchRelPath(run_id: string): string {
  return join(".mrmr", "dev", "runs", prefixedRunId(run_id));
}

/** Absolute run-scratch root. */
export function runScratchDir(space_root: string, run_id: string): string {
  return join(space_root, runScratchRelPath(run_id));
}

/**
 * Absolute space run-scratch root: `{space_root}/.mrmr/dev/runs`. The only
 * constructor for the per-space runs tree; quota accounting and GC walk this
 * directory instead of rebuilding the literal `.mrmr/dev/runs` path.
 */
export function spaceRunsDir(space_root: string): string {
  return join(space_root, ".mrmr", "dev", "runs");
}

/** Absolute path to a run's `active-step-contract.json`. */
export function activeContractPath(space_root: string, run_id: string): string {
  return join(runScratchDir(space_root, run_id), "active-step-contract.json");
}

/** Relative step workdir: `.mrmr/dev/runs/{run_id}/steps/{step_id}/work`. */
export function stepWorkdirRel(run_id: string, step_id: string): string {
  return join(runScratchRelPath(run_id), "steps", step_id, "work");
}

/** Relative step stable (promoted artifact) dir: `.mrmr/dev/runs/{run_id}/steps/{step_id}`. */
export function stepStableDirRel(run_id: string, step_id: string): string {
  return join(runScratchRelPath(run_id), "steps", step_id);
}

/**
 * Relative stable slot dir for a collection: `.mrmr/dev/runs/{run_id}/steps/
 * {step_id}/{slot}`. The `.directory` token binds to this promoted slot
 * directory; a collection consumer copy is materialized under the consumer
 * step's `inputs/{slot}` tree.
 */
export function stableSlotDirRel(run_id: string, step_id: string, slot: string): string {
  return join(stepStableDirRel(run_id, step_id), slot);
}

/** Relative consumer-inputs dir for a step: `.mrmr/dev/runs/{run_id}/steps/{step_id}/inputs`. */
export function stepInputsDirRel(run_id: string, step_id: string): string {
  return join(stepStableDirRel(run_id, step_id), "inputs");
}

/**
 * Relative path of one verified local consumer copy:
 * `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/{filename}`.
 */
export function consumerInputRelPath(
  run_id: string,
  consumer_step: string,
  slot: string,
  filename: string,
): string {
  return join(stepInputsDirRel(run_id, consumer_step), slot, filename);
}

/** Absolute path of one verified local consumer copy. */
export function consumerInputPath(
  space_root: string,
  run_id: string,
  consumer_step: string,
  slot: string,
  filename: string,
): string {
  return join(space_root, consumerInputRelPath(run_id, consumer_step, slot, filename));
}

/**
 * Absolute path of a consumer step's verified input directory for one slot:
 * `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}`. A collection
 * `.directory` token resolves to this directory after every file in the slot is
 * materialized atomically inside it.
 */
export function consumerInputsDirPath(
  space_root: string,
  run_id: string,
  consumer_step: string,
  slot: string,
): string {
  return join(space_root, stepInputsDirRel(run_id, consumer_step), slot);
}

/**
 * Build the canonical run-scratch path bundle. When `step_id` is supplied the
 * workdir, stable dir, and consumer-inputs dir are included; otherwise only
 * the run dir and active-contract path are returned.
 */
export function runScratchPaths(
  space_root: string,
  run_id: string,
  step_id?: string,
): RunScratchPaths {
  const run_dir = runScratchDir(space_root, run_id);
  const paths: RunScratchPaths = {
    space_root,
    run_dir,
    active_contract_path: join(run_dir, "active-step-contract.json"),
  };
  if (step_id) {
    paths.workdir = join(run_dir, "steps", step_id, "work");
    paths.stable_dir = join(run_dir, "steps", step_id);
    paths.inputs_dir = join(run_dir, "steps", step_id, "inputs");
  }
  return paths;
}
