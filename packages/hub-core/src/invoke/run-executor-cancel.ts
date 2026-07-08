import type { ChildProcess } from "node:child_process";

export interface RunExecutorCancelHandle {
  cancel(): void;
}

const handlesByRun = new Map<string, Set<RunExecutorCancelHandle>>();

function normalizedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

export function registerRunExecutorCancel(
  run_id: string | undefined,
  handle: RunExecutorCancelHandle,
): () => void {
  if (!run_id) return () => undefined;
  const key = normalizedRunId(run_id);
  let set = handlesByRun.get(key);
  if (!set) {
    set = new Set();
    handlesByRun.set(key, set);
  }
  set.add(handle);
  return () => {
    set?.delete(handle);
    if (set?.size === 0) handlesByRun.delete(key);
  };
}

export function registerShellProcessCancel(run_id: string | undefined, child: ChildProcess): () => void {
  return registerRunExecutorCancel(run_id, {
    cancel() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 5_000).unref();
    },
  });
}

/** Cancel in-flight executors when a run enters a terminal lifecycle. */
export function cancelRunExecutors(run_id: string): number {
  const key = normalizedRunId(run_id);
  const set = handlesByRun.get(key);
  if (!set?.size) return 0;
  let count = 0;
  for (const handle of set) {
    handle.cancel();
    count += 1;
  }
  handlesByRun.delete(key);
  return count;
}

export function clearRunExecutorCancelRegistry(): void {
  handlesByRun.clear();
}
