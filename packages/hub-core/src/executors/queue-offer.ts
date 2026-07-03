import type { ExecutorTaskOffer } from "@murrmure/contracts";
import type { InvokeRequest } from "@murrmure/runtime-contracts";
import type { ExecutorPollStore, QueuedTaskRecord } from "./queue-store.js";

const DEFAULT_ACTION_TIMEOUT_MS = 30 * 60 * 1000;

export interface EnqueueTaskOfferInput {
  task_id: string;
  executor_id: string;
  invoke: InvokeRequest;
  action_name: string;
  actor_id: string;
  token_id: string;
  timeout_ms?: number;
  clock: { nowIso(): string; now(): number };
}

export function buildTaskOffer(input: EnqueueTaskOfferInput): ExecutorTaskOffer {
  const step_id = input.invoke.step_id ?? `action:${input.action_name}`;
  const timeoutMs = input.timeout_ms ?? DEFAULT_ACTION_TIMEOUT_MS;
  const deadline_at = new Date(input.clock.now() + timeoutMs).toISOString();

  return {
    task_id: input.task_id,
    run_id: input.invoke.run_id ?? "run_unknown",
    step_id,
    action_name: input.action_name,
    space_id: input.invoke.space_id,
    params: input.invoke.params ?? {},
    artifacts_in: input.invoke.artifacts_in,
    deadline_at,
  };
}

export function enqueueTaskOffer(
  store: ExecutorPollStore,
  input: EnqueueTaskOfferInput,
): QueuedTaskRecord {
  const offer = buildTaskOffer(input);
  const record: QueuedTaskRecord = {
    task_id: input.task_id,
    executor_id: input.executor_id,
    offer,
    status: "offered",
    actor_id: input.actor_id,
    token_id: input.token_id,
    action_name: input.action_name,
    session_id: input.invoke.session_id,
  };
  store.enqueue(record);
  return record;
}
