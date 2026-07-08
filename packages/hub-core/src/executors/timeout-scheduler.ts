import type { RunStepMemo, StepContractCatalog } from "@murrmure/contracts";
import { catalogEntryForStep } from "../flow-engine/step-catalog.js";

export interface ExecutorTimeoutEntry {
  run_id: string;
  step_id: string;
  action_name?: string;
  timeout_ms: number;
  started_at: number;
  paused_ms: number;
  pause_started_at?: number;
}

export interface ExecutorTimeoutExpired {
  run_id: string;
  step_id: string;
  action_name?: string;
  timeout_ms: number;
  elapsed_ms: number;
}

function runKey(run_id: string, step_id: string): string {
  const run = run_id.startsWith("run_") ? run_id : `run_${run_id}`;
  return `${run}:${step_id}`;
}

function normalizedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

export function humanStepPausesExecutorTimeout(
  catalog: StepContractCatalog | null | undefined,
  executor_step_id: string,
  human_step_id: string,
): boolean {
  if (executor_step_id === human_step_id) return false;
  if (human_step_id.startsWith(`${executor_step_id}.`)) return true;
  const humanEntry = catalogEntryForStep(catalog, human_step_id);
  if (humanEntry?.parent_id === executor_step_id) return true;
  return false;
}

export function runHasAwaitingHumanForExecutor(
  catalog: StepContractCatalog | null | undefined,
  memos: RunStepMemo[],
  executor_step_id: string,
): boolean {
  return memos.some(
    (memo) =>
      memo.status === "awaiting_human" &&
      humanStepPausesExecutorTimeout(catalog, executor_step_id, memo.step_id),
  );
}

export class ExecutorTimeoutScheduler {
  private readonly entries = new Map<string, ExecutorTimeoutEntry>();

  start(input: {
    run_id: string;
    step_id: string;
    timeout_ms: number;
    action_name?: string;
    now?: number;
  }): void {
    if (input.timeout_ms <= 0) return;
    const key = runKey(input.run_id, input.step_id);
    this.entries.set(key, {
      run_id: normalizedRunId(input.run_id),
      step_id: input.step_id,
      action_name: input.action_name,
      timeout_ms: input.timeout_ms,
      started_at: input.now ?? Date.now(),
      paused_ms: 0,
    });
  }

  stop(run_id: string, step_id: string): void {
    this.entries.delete(runKey(run_id, step_id));
  }

  stopRun(run_id: string): void {
    const prefix = `${normalizedRunId(run_id)}:`;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  get(run_id: string, step_id: string): ExecutorTimeoutEntry | undefined {
    return this.entries.get(runKey(run_id, step_id));
  }

  syncHumanWaitPause(input: {
    run_id: string;
    catalog: StepContractCatalog | null | undefined;
    memos: RunStepMemo[];
    now?: number;
  }): number {
    const now = input.now ?? Date.now();
    const prefix = `${normalizedRunId(input.run_id)}:`;
    let extendMs = 0;
    for (const [key, entry] of this.entries) {
      if (!key.startsWith(prefix)) continue;
      const shouldPause = runHasAwaitingHumanForExecutor(input.catalog, input.memos, entry.step_id);
      if (shouldPause && entry.pause_started_at === undefined) {
        entry.pause_started_at = now;
      } else if (!shouldPause && entry.pause_started_at !== undefined) {
        const paused = now - entry.pause_started_at;
        entry.paused_ms += paused;
        extendMs += paused;
        entry.pause_started_at = undefined;
      }
    }
    return extendMs;
  }

  effectiveElapsedMs(entry: ExecutorTimeoutEntry, now = Date.now()): number {
    const activePause = entry.pause_started_at ? now - entry.pause_started_at : 0;
    return now - entry.started_at - entry.paused_ms - activePause;
  }

  collectExpired(now = Date.now()): ExecutorTimeoutExpired[] {
    const expired: ExecutorTimeoutExpired[] = [];
    for (const entry of this.entries.values()) {
      const elapsed = this.effectiveElapsedMs(entry, now);
      if (elapsed >= entry.timeout_ms) {
        expired.push({
          run_id: entry.run_id,
          step_id: entry.step_id,
          action_name: entry.action_name,
          timeout_ms: entry.timeout_ms,
          elapsed_ms: elapsed,
        });
      }
    }
    return expired;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const defaultExecutorTimeoutScheduler = new ExecutorTimeoutScheduler();

export function formatActionTimedOutSummary(input: {
  step_id: string;
  action_name?: string;
  timeout_ms: number;
  human_wait_excluded?: boolean;
}): string {
  const label = input.action_name ?? input.step_id;
  const seconds = Math.round(input.timeout_ms / 1000);
  const base = `Agent action '${label}' exceeded ${seconds}s executor limit on step '${input.step_id}'.`;
  if (input.human_wait_excluded) {
    return `${base} Human review wait time is excluded from this limit.`;
  }
  return base;
}
