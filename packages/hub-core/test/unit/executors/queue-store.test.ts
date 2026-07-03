import { describe, expect, test } from "vitest";
import { createInProcessExecutorPollStore } from "../../../src/executors/queue-store.js";
import { enqueueTaskOffer } from "../../../src/executors/queue-offer.js";

describe("executor poll store", () => {
  test("poll receives enqueued offer", async () => {
    const store = createInProcessExecutorPollStore();
    store.recordPoll("remote-build");

    enqueueTaskOffer(store, {
      task_id: "tsk_test",
      executor_id: "remote-build",
      invoke: {
        space_id: "spc_test",
        action_name: "build",
        run_id: "run_test",
        params: { target: "linux" },
      },
      action_name: "build",
      actor_id: "actor",
      token_id: "tok",
      clock: { now: () => Date.now(), nowIso: () => new Date().toISOString() },
    });

    const offers = await store.poll("remote-build", 500);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.action_name).toBe("build");
  });

  test("timed-out poll does not steal later task offers", async () => {
    const store = createInProcessExecutorPollStore();
    store.recordPoll("remote-build");
    await store.poll("remote-build", 20);
    enqueueTaskOffer(store, {
      task_id: "tsk_late",
      executor_id: "remote-build",
      invoke: {
        space_id: "spc_test",
        action_name: "build",
        run_id: "run_test",
        params: {},
      },
      action_name: "build",
      actor_id: "actor",
      token_id: "tok",
      clock: { now: () => Date.now(), nowIso: () => new Date().toISOString() },
    });
    expect(store.pendingCount("remote-build")).toBe(1);
  });
});
