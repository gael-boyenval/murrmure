import type { ExecutorTaskOffer } from "@murrmure/contracts";

export const DEFAULT_WORKER_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_POLL_TIMEOUT_MS = 30_000;

export type TaskRecordStatus = "offered" | "completed" | "failed";

export interface QueuedTaskRecord {
  task_id: string;
  executor_id: string;
  offer: ExecutorTaskOffer;
  status: TaskRecordStatus;
  actor_id: string;
  token_id: string;
  action_name: string;
  session_id?: string;
  idempotency_key?: string;
  completed_result?: Record<string, unknown>;
  error_code?: string;
  detail?: string;
}

export interface ExecutorPollStore {
  recordPoll(executor_id: string, at?: string): void;
  lastPollAt(executor_id: string): string | null;
  isReachable(executor_id: string, worker_ttl_ms?: number): boolean;
  enqueue(record: QueuedTaskRecord): void;
  poll(executor_id: string, timeout_ms?: number): Promise<ExecutorTaskOffer[]>;
  get(task_id: string): QueuedTaskRecord | null;
  markCompleted(
    task_id: string,
    result?: Record<string, unknown>,
  ): QueuedTaskRecord | null;
  markFailed(
    task_id: string,
    error_code?: string,
    detail?: string,
  ): QueuedTaskRecord | null;
  listExecutorIds(): string[];
  pendingCount(executor_id: string): number;
}

export function createInProcessExecutorPollStore(
  clock: { now(): number; nowIso(): string } = {
    now: () => Date.now(),
    nowIso: () => new Date().toISOString(),
  },
): ExecutorPollStore {
  const lastPoll = new Map<string, string>();
  const tasks = new Map<string, QueuedTaskRecord>();
  const pendingByExecutor = new Map<string, string[]>();
  const waiters = new Map<string, Array<() => void>>();

  function removeWaiter(executor_id: string, wake: () => void): void {
    const list = waiters.get(executor_id) ?? [];
    waiters.set(
      executor_id,
      list.filter((fn) => fn !== wake),
    );
  }

  function notify(executor_id: string): void {
    const list = [...(waiters.get(executor_id) ?? [])];
    if (!list.length) return;
    for (const wake of list) wake();
  }

  return {
    recordPoll(executor_id, at) {
      lastPoll.set(executor_id, at ?? clock.nowIso());
    },

    lastPollAt(executor_id) {
      return lastPoll.get(executor_id) ?? null;
    },

    isReachable(executor_id, worker_ttl_ms = DEFAULT_WORKER_TTL_MS) {
      const ts = lastPoll.get(executor_id);
      if (!ts) return false;
      return clock.now() - Date.parse(ts) <= worker_ttl_ms;
    },

    enqueue(record) {
      tasks.set(record.task_id, record);
      const queue = pendingByExecutor.get(record.executor_id) ?? [];
      queue.push(record.task_id);
      pendingByExecutor.set(record.executor_id, queue);
      notify(record.executor_id);
    },

    async poll(executor_id, timeout_ms = DEFAULT_POLL_TIMEOUT_MS) {
      this.recordPoll(executor_id);

      const drain = (): ExecutorTaskOffer[] => {
        const queue = pendingByExecutor.get(executor_id) ?? [];
        const offers: ExecutorTaskOffer[] = [];
        const remaining: string[] = [];
        for (const task_id of queue) {
          const row = tasks.get(task_id);
          if (row?.status === "offered") {
            offers.push(row.offer);
          } else {
            remaining.push(task_id);
          }
        }
        pendingByExecutor.set(executor_id, remaining);
        return offers;
      };

      const immediate = drain();
      if (immediate.length > 0) return immediate;

      return new Promise((resolve) => {
        const deadline = clock.now() + timeout_ms;
        let settled = false;

        const finish = (offers: ExecutorTaskOffer[]) => {
          if (settled) return;
          settled = true;
          removeWaiter(executor_id, wake);
          resolve(offers);
        };

        const wake = () => {
          if (settled) return;
          const next = drain();
          if (next.length > 0) {
            finish(next);
            return;
          }
          if (clock.now() >= deadline) {
            finish([]);
            return;
          }
          setTimeout(wake, Math.min(250, deadline - clock.now()));
        };

        const waitList = waiters.get(executor_id) ?? [];
        waitList.push(wake);
        waiters.set(executor_id, waitList);
        setTimeout(wake, Math.min(250, deadline - clock.now()));
      });
    },

    get(task_id) {
      return tasks.get(task_id) ?? null;
    },

    markCompleted(task_id, result) {
      const row = tasks.get(task_id);
      if (!row) return null;
      if (row.status === "completed") return row;
      const updated: QueuedTaskRecord = {
        ...row,
        status: "completed",
        completed_result: result,
      };
      tasks.set(task_id, updated);
      return updated;
    },

    markFailed(task_id, error_code, detail) {
      const row = tasks.get(task_id);
      if (!row) return null;
      if (row.status === "failed") return row;
      const updated: QueuedTaskRecord = {
        ...row,
        status: "failed",
        error_code,
        detail,
      };
      tasks.set(task_id, updated);
      return updated;
    },

    listExecutorIds() {
      return [...new Set([...lastPoll.keys(), ...pendingByExecutor.keys()])];
    },

    pendingCount(executor_id) {
      return (pendingByExecutor.get(executor_id) ?? []).filter((task_id) => {
        const row = tasks.get(task_id);
        return row?.status === "offered";
      }).length;
    },
  };
}
