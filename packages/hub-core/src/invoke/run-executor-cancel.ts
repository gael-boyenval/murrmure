import type { ChildProcess } from "node:child_process";
import type { ExecutorPollStore } from "../executors/queue-store.js";
import { defaultExecutorTimeoutScheduler } from "../executors/timeout-scheduler.js";
import { revokeRunResolveCredentials } from "./run-resolve-credential-registry.js";

export interface RunExecutorCancelHandle {
  cancel(): void;
  /** Resolves once the process tree has been reaped (SIGTERM, then SIGKILL after grace). */
  awaitTermination(): Promise<void>;
}

const handlesByKey = new Map<string, Set<RunExecutorCancelHandle>>();
/** Termination promises for every cancelled handle, awaited on shutdown. */
const pendingTerminations: Promise<void>[] = [];
/** Idempotent per-child termination so repeated cancels reap the tree once. */
const terminationByChild = new WeakMap<ChildProcess, Promise<void>>();

/** Grace period between SIGTERM and SIGKILL escalation (matches shell-spawn). */
export const TERMINATION_GRACE_MS = 5_000;

function normalizedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

function executorKey(run_id: string, step_id: string): string {
  return `${normalizedRunId(run_id)}:${step_id}`;
}

function runKeyPrefix(run_id: string): string {
  return `${normalizedRunId(run_id)}:`;
}

export function registerRunExecutorCancel(
  key: string | undefined,
  handle: RunExecutorCancelHandle,
): () => void {
  if (!key) return () => undefined;
  let set = handlesByKey.get(key);
  if (!set) {
    set = new Set();
    handlesByKey.set(key, set);
  }
  set.add(handle);
  return () => {
    set?.delete(handle);
    if (set?.size === 0) handlesByKey.delete(key);
  };
}

/**
 * Send SIGTERM to the child and its process group, then SIGKILL after the grace
 * period. Idempotent per child: a repeated cancel returns the same promise and
 * never re-sends signals, so the process tree is terminated exactly once. The
 * SIGKILL escalation timer is intentionally NOT unref'd — Hub/Desktop shutdown
 * awaits the returned promise, so the event loop stays alive until a
 * TERM-resistant descendant is reaped.
 *
 * The escalation stays armed even when the shell leader exits on SIGTERM: the
 * leader's `close`/`exit` only resolves early once the ENTIRE process group is
 * confirmed dead (probed with signal 0). A surviving TERM-resistant descendant
 * keeps the group alive, so the SIGKILL escalation fires on the group after the
 * grace period and the awaited shutdown does not return until the tree is gone.
 */
function killChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  const existing = terminationByChild.get(child);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const pid = child.pid;
    let settled = false;
    let escalation: ReturnType<typeof setTimeout> | undefined;

    const reapGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
      if (!pid) return;
      try {
        process.kill(-pid, signal);
      } catch {
        // Process group already gone.
      }
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      if (escalation) clearTimeout(escalation);
      resolve();
    };

    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    reapGroup("SIGTERM");

    // When the leader exits, only resolve early if the ENTIRE process group is
    // dead (probe with signal 0). A TERM-resistant descendant keeps the group
    // alive, so the SIGKILL escalation stays armed and awaited.
    const onLeaderGone = (): void => {
      if (settled) return;
      if (!pid) {
        finish();
        return;
      }
      try {
        // A live member (e.g. a TERM-resistant descendant) keeps the probe alive;
        // leave the SIGKILL escalation armed.
        process.kill(-pid, 0);
      } catch {
        finish();
      }
    };
    if (typeof (child as { once?: unknown }).once === "function") {
      child.once("close", onLeaderGone);
      child.once("exit", onLeaderGone);
    }

    escalation = setTimeout(() => {
      // Always reap the process group after the grace period so a
      // TERM-resistant descendant cannot survive the shell exiting. The direct
      // child kill is skipped once the leader is already dead.
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
      reapGroup("SIGKILL");
      finish();
    }, TERMINATION_GRACE_MS);
  });

  terminationByChild.set(child, promise);
  return promise;
}

export function registerShellProcessCancel(
  run_id: string | undefined,
  step_id: string,
  child: ChildProcess,
): () => void {
  if (!run_id) return () => undefined;
  let termination: Promise<void> | undefined;
  const handle: RunExecutorCancelHandle = {
    cancel() {
      if (!termination) termination = killChildProcess(child);
    },
    awaitTermination() {
      return termination ?? Promise.resolve();
    },
  };
  return registerRunExecutorCancel(executorKey(run_id, step_id), handle);
}

function cancelHandlesForKeys(keys: string[]): number {
  let count = 0;
  for (const key of keys) {
    const set = handlesByKey.get(key);
    if (!set?.size) continue;
    for (const handle of set) {
      handle.cancel();
      pendingTerminations.push(handle.awaitTermination());
      count += 1;
    }
    handlesByKey.delete(key);
  }
  return count;
}

/** Cancel in-flight executors for one step. */
export function cancelStepExecutor(run_id: string, step_id: string): number {
  return cancelHandlesForKeys([executorKey(run_id, step_id)]);
}

/** Cancel all in-flight executors when a run enters a terminal lifecycle. */
export function cancelRunExecutors(run_id: string): number {
  const prefix = runKeyPrefix(run_id);
  const keys = [...handlesByKey.keys()].filter((key) => key.startsWith(prefix));
  return cancelHandlesForKeys(keys);
}

/**
 * Cancel every registered shell executor (all runs/steps). Used on Hub/Desktop
 * shutdown so no spawned handler process tree is orphaned when the daemon stops.
 * Pair with `awaitAllShellExecutorsTerminated` to await the SIGKILL escalation
 * before the process exits.
 */
export function cancelAllShellExecutors(): number {
  const keys = [...handlesByKey.keys()];
  return cancelHandlesForKeys(keys);
}

/**
 * Await every pending shell-executor termination started by a cancel path. Used
 * on shutdown so a TERM-resistant descendant is reaped (SIGKILL escalation)
 * before the daemon process exits.
 */
export async function awaitAllShellExecutorsTerminated(): Promise<void> {
  const pending = pendingTerminations.splice(0);
  await Promise.all(pending);
}

export function terminateRunExecutors(input: {
  run_id: string;
  executorPollStore?: ExecutorPollStore;
  reason?: string;
}): number {
  const killed = cancelRunExecutors(input.run_id);
  defaultExecutorTimeoutScheduler.stopRun(input.run_id);
  // A terminal run revokes every ephemeral resolve credential it minted so no
  // persistent child credential survives a finished assignment.
  revokeRunResolveCredentials(input.run_id);
  const pollReason = input.reason?.toLowerCase().includes("cancel")
    ? "RUN_CANCELLED"
    : "RUN_TERMINATED";
  input.executorPollStore?.cancelOfferedForRun(
    input.run_id,
    pollReason,
    input.reason ?? "Run terminated",
  );
  return killed;
}

export function clearRunExecutorCancelRegistry(): void {
  handlesByKey.clear();
  pendingTerminations.length = 0;
}
