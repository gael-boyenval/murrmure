import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { Capability } from "@murrmure/contracts";
import { hasCapability } from "../grants/migrate.js";
import { completeAsyncInvoke, journalInvokeLifecycle } from "../invoke/completion.js";
import type { InvokeJournalWriter } from "../invoke/types.js";
import type { ExecutorPollStore } from "./queue-store.js";

export interface ExecutorPollAuthContext {
  space_id: string;
  harness_id?: string;
  capabilities: Capability[];
}

export function canPollExecutor(
  auth: ExecutorPollAuthContext,
  executor_id: string,
): boolean {
  if (auth.space_id === "bootstrap") return true;
  if (!hasCapability(auth.capabilities, "executor:poll")) return false;
  if (hasCapability(auth.capabilities, "hub:admin")) return true;
  if (auth.harness_id && auth.harness_id !== executor_id) return false;
  return true;
}

export interface CompleteTaskInput {
  task_id: string;
  result?: Record<string, unknown>;
}

export interface FailTaskInput {
  task_id: string;
  error_code?: string;
  detail?: string;
}

export async function completeQueuedTask(
  store: ExecutorPollStore,
  journal: InvokeJournalWriter,
  input: CompleteTaskInput,
): Promise<
  | { ok: true; outcome: Awaited<ReturnType<typeof completeAsyncInvoke>>; record: NonNullable<ReturnType<ExecutorPollStore["get"]>> }
  | { ok: false; code: string; message: string; http: number }
> {
  const record = store.get(input.task_id);
  if (!record) {
    return { ok: false, code: "TASK_NOT_FOUND", message: "Task offer not found", http: 404 };
  }

  if (record.status === "completed") {
    return {
      ok: true,
      outcome: {
        status: "completed",
        run_id: record.offer.run_id,
        step_id: record.offer.step_id,
        result: record.completed_result,
      },
      record,
    };
  }

  if (record.status === "failed") {
    return {
      ok: false,
      code: "TASK_ALREADY_FAILED",
      message: "Task was already marked failed",
      http: 409,
    };
  }

  store.markCompleted(input.task_id, input.result);
  const outcome = await completeAsyncInvoke(journal, {
    space_id: record.offer.space_id,
    session_id: record.session_id,
    run_id: record.offer.run_id,
    step_id: record.offer.step_id,
    action_name: record.action_name,
    actor_id: record.actor_id,
    token_id: record.token_id,
    result: input.result,
  });

  return { ok: true, outcome, record: store.get(input.task_id)! };
}

export async function failQueuedTask(
  store: ExecutorPollStore,
  journal: InvokeJournalWriter,
  input: FailTaskInput,
): Promise<
  | { ok: true; record: NonNullable<ReturnType<ExecutorPollStore["get"]>> }
  | { ok: false; code: string; message: string; http: number }
> {
  const record = store.get(input.task_id);
  if (!record) {
    return { ok: false, code: "TASK_NOT_FOUND", message: "Task offer not found", http: 404 };
  }

  if (record.status === "failed") {
    return { ok: true, record };
  }

  if (record.status === "completed") {
    return {
      ok: false,
      code: "TASK_ALREADY_COMPLETED",
      message: "Task was already completed",
      http: 409,
    };
  }

  store.markFailed(input.task_id, input.error_code, input.detail);
  await journalInvokeLifecycle(journal, {
    type: JOURNAL_EVENT_TYPES.ACTION_FAILED,
    space_id: record.offer.space_id,
    session_id: record.session_id,
    run_id: record.offer.run_id,
    step_id: record.offer.step_id,
    action_name: record.action_name,
    actor_id: record.actor_id,
    token_id: record.token_id,
    data: {
      error_code: input.error_code ?? "WORKER_FAILED",
      detail: input.detail,
    },
  });

  return { ok: true, record: store.get(input.task_id)! };
}
