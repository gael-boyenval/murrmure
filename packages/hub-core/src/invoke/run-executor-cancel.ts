import type { ChildProcess } from "node:child_process";
import type { ExecutorPollStore } from "../executors/queue-store.js";
import { defaultExecutorTimeoutScheduler } from "../executors/timeout-scheduler.js";

export interface RunExecutorCancelHandle {
  cancel(): void;
}

const handlesByKey = new Map<string, Set<RunExecutorCancelHandle>>();

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

function killChildProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  child.kill("SIGTERM");
  if (pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Process group kill is best-effort (shell may not own a group).
    }
  }
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      if (pid) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // ignore
        }
      }
    }
  }, 5_000).unref();
}

export function registerShellProcessCancel(
  run_id: string | undefined,
  step_id: string,
  child: ChildProcess,
): () => void {
  if (!run_id) return () => undefined;
  return registerRunExecutorCancel(executorKey(run_id, step_id), {
    cancel() {
      killChildProcess(child);
    },
  });
}

function cancelHandlesForKeys(keys: string[]): number {
  let count = 0;
  for (const key of keys) {
    const set = handlesByKey.get(key);
    if (!set?.size) continue;
    for (const handle of set) {
      handle.cancel();
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

export function terminateRunExecutors(input: {
  run_id: string;
  executorPollStore?: ExecutorPollStore;
  reason?: string;
}): number {
  const killed = cancelRunExecutors(input.run_id);
  defaultExecutorTimeoutScheduler.stopRun(input.run_id);
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
}
