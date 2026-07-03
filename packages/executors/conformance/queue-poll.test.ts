import { describe, expect, test } from "vitest";
import { createExecutorRegistry } from "../src/registry.js";
import {
  createInProcessExecutorPollStore,
  enqueueTaskOffer,
  completeQueuedTask,
  orchestrateInvoke,
  type InvokeJournalWriter,
  type InvokeMemoStore,
  type ResolvedInvoke,
} from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { InvokeRequest } from "@murrmure/runtime-contracts";
describe("queue_poll executor conformance", () => {
  test("offer → complete → idempotent complete", async () => {
    const store = createInProcessExecutorPollStore();
    store.recordPoll("remote-build");

    const journalTypes: string[] = [];
    const journal: InvokeJournalWriter = {
      append: async (input) => {
        journalTypes.push(input.type);
      },
    };

    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      queuePoll: {
        isReachable: (executor_id) => store.isReachable(executor_id),
        createTaskId: () => "tsk_conformance",
        enqueue: (input) => {
          enqueueTaskOffer(store, {
            ...input,
            actor_id: "actor_worker",
            token_id: "tok_worker",
            clock: { now: () => Date.now(), nowIso: () => new Date().toISOString() },
          });
        },
      },
    });

    const binding = { type: "queue_poll" as const, executor_id: "remote-build" };
    const port = registry.getPort(binding)!;
    const preflight = await port.preflight(binding, { space_id: "spc_test" });
    expect(preflight.status).toBe("reachable");

    const resolved: ResolvedInvoke = {
      action: { name: "build", executor: "remote-build" },
      binding,
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "build",
      run_id: "run_test",
      params: { target: "linux" },
    };
    const memoStore: InvokeMemoStore = { get: () => null, set: () => {} };

    const response = await orchestrateInvoke(
      resolved,
      request,
      { actor_id: "actor_invoke", token_id: "tok_invoke" },
      { registry, memoStore, journal, clock: { nowIso: () => new Date().toISOString() } },
    );
    expect(response.dispatch.status).toBe("dispatched");
    expect(journalTypes).toContain(JOURNAL_EVENT_TYPES.ACTION_DISPATCHED);

    const offers = await store.poll("remote-build", 100);
    expect(offers).toHaveLength(1);

    const first = await completeQueuedTask(store, journal, {
      task_id: offers[0]!.task_id,
      result: { ok: true },
    });
    expect(first.ok).toBe(true);
    expect(journalTypes).toContain(JOURNAL_EVENT_TYPES.ACTION_COMPLETED);

    const second = await completeQueuedTask(store, journal, {
      task_id: offers[0]!.task_id,
      result: { ok: true },
    });
    expect(second.ok).toBe(true);
    expect(journalTypes.filter((t) => t === JOURNAL_EVENT_TYPES.ACTION_COMPLETED)).toHaveLength(1);
  });

  test("unreachable worker fails fast", async () => {
    const store = createInProcessExecutorPollStore();
    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      queuePoll: {
        isReachable: () => false,
        createTaskId: () => "tsk_conformance",
        enqueue: () => {},
      },
    });

    const binding = { type: "queue_poll" as const, executor_id: "remote-build" };
    const port = registry.getPort(binding)!;
    const outcome = await port.dispatch(
      { space_id: "spc_test", action_name: "build", run_id: "run_x" },
      { action: { name: "build" }, binding },
    );
    expect(outcome.status).toBe("executor_unavailable");
    expect(outcome.error_code).toBe("EXECUTOR_UNAVAILABLE");
    expect(store.listExecutorIds()).toHaveLength(0);
  });
});
