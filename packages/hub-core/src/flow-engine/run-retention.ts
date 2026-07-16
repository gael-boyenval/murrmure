import { rm } from "node:fs/promises";
import type { RunLifecycle } from "@murrmure/contracts";
import { directoryBytes } from "./fs-bytes.js";
import { runScratchDir } from "./run-scratch-paths.js";

/** Terminal run lifecycles whose local bytes are subject to retention expiry. */
const TERMINAL_RUN_LIFECYCLES: ReadonlySet<RunLifecycle> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

/** Active run lifecycles that are never garbage-collected. */
const ACTIVE_RUN_LIFECYCLES: ReadonlySet<RunLifecycle> = new Set([
  "working",
  "input-required",
]);

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Terminal local run data is retained for this many days after `ended_at`
 * before its run-scratch tree is eligible for garbage collection. See ADR-014
 * and the [run-scratch-path-normalize](../../../plans/2026-07-10-run-scratch-path-normalize.md)
 * plan. Active run directories are never eligible.
 */
export const RUN_RETENTION_DAYS = 7;
export const RUN_RETENTION_MS = RUN_RETENTION_DAYS * DAY_MS;

/** A run projected to the fields retention GC needs (no exec_context). */
export interface RunRetentionRun {
  run_id: string;
  space_id?: string;
  lifecycle: RunLifecycle;
  ended_at?: string;
}

/**
 * Injected dependencies so the sweep stays pure and testable with a fake clock
 * and stubbed persistence. The real wiring is in `hub-daemon`'s
 * `run-retention-gc.ts`.
 */
export interface RunRetentionDeps {
  /** All runs known to the hub (active and terminal); the sweep classifies them. */
  listRuns(): Promise<RunRetentionRun[]>;
  /** Resolve the local space root for a space id, or `undefined` if unlinked. */
  resolveSpaceRoot(space_id: string): Promise<string | undefined>;
  /** Recursively remove a directory tree; must not throw if it is already absent. */
  removeTree(path: string): Promise<void>;
  /** Sum the bytes of a directory tree (`0` if absent). Used for freed-byte metrics. */
  directoryBytes(path: string): Promise<number>;
}

/**
 * Sanitized retention sweep result. Counts and freed bytes only — no run ids,
 * space ids, host paths, or content — so the summary is safe to log and surface
 * to operators/support without leaking local filesystem detail.
 */
export interface RunRetentionSummary {
  /** Terminal run-scratch trees removed. */
  swept: number;
  /** Bytes freed across swept trees. */
  bytes_freed: number;
  /** Active runs skipped (never collected). */
  skipped_active: number;
  /** Terminal runs not yet past the retention window (or missing `ended_at`). */
  skipped_not_eligible: number;
  /** Terminal runs whose space has no local root (cannot locate a tree to remove). */
  skipped_no_root: number;
  /** Removal failures (the tree is left for the next sweep). */
  errors: number;
}

export function isTerminalRun(lifecycle: RunLifecycle): boolean {
  return TERMINAL_RUN_LIFECYCLES.has(lifecycle);
}

export function isActiveRun(lifecycle: RunLifecycle): boolean {
  return ACTIVE_RUN_LIFECYCLES.has(lifecycle);
}

/**
 * A run is eligible for retention GC when it is terminal, has an `ended_at`
 * timestamp, and `now` is at or past `ended_at + RUN_RETENTION_DAYS`. Active
 * runs are never eligible. The boundary is inclusive: a run expires exactly at
 * `ended_at + 7 days` (a fake clock one millisecond earlier keeps it).
 */
export function isRetentionEligible(
  run: { lifecycle: RunLifecycle; ended_at?: string },
  now: Date,
  retentionDays: number = RUN_RETENTION_DAYS,
): boolean {
  if (!isTerminalRun(run.lifecycle)) return false;
  if (!run.ended_at) return false;
  const endedMs = Date.parse(run.ended_at);
  if (Number.isNaN(endedMs)) return false;
  return now.getTime() - endedMs >= retentionDays * DAY_MS;
}

/**
 * Sweep terminal run-scratch trees that are past the retention window.
 *
 * Only `.mrmr/dev/runs/{run_id}/` (constructed via `runScratchDir`) is removed —
 * the canonical and only local run root. Journal metadata, run rows, and global
 * artifact manifests/refs live in the persistence store and the shared exchange
 * tree, not under the per-run tree, so they are preserved independently of local
 * byte deletion. Active runs are classified and skipped without touching disk.
 * A removal failure is counted and the tree is left for the next sweep rather
 * than aborting the pass (partial-failure tolerance).
 */
export async function sweepRunRetention(
  deps: RunRetentionDeps,
  now: Date,
  retentionDays: number = RUN_RETENTION_DAYS,
): Promise<RunRetentionSummary> {
  const runs = await deps.listRuns();
  const summary: RunRetentionSummary = {
    swept: 0,
    bytes_freed: 0,
    skipped_active: 0,
    skipped_not_eligible: 0,
    skipped_no_root: 0,
    errors: 0,
  };
  for (const run of runs) {
    if (isActiveRun(run.lifecycle)) {
      summary.skipped_active++;
      continue;
    }
    if (!isTerminalRun(run.lifecycle)) {
      // Unknown/non-terminal lifecycle: treat as not eligible, never collect.
      summary.skipped_not_eligible++;
      continue;
    }
    if (!isRetentionEligible(run, now, retentionDays)) {
      summary.skipped_not_eligible++;
      continue;
    }
    if (!run.space_id) {
      summary.skipped_no_root++;
      continue;
    }
    const spaceRoot = await deps.resolveSpaceRoot(run.space_id);
    if (!spaceRoot) {
      summary.skipped_no_root++;
      continue;
    }
    const runDir = runScratchDir(spaceRoot, run.run_id);
    try {
      const bytes = await deps.directoryBytes(runDir);
      await deps.removeTree(runDir);
      summary.swept++;
      summary.bytes_freed += bytes;
    } catch {
      summary.errors++;
    }
  }
  return summary;
}

/** Default `removeTree` using POSIX recursive force removal (absent = no-op). */
export async function removeTree(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/** Default `directoryBytes` dependency (re-exported from `fs-bytes`). */
export { directoryBytes };
