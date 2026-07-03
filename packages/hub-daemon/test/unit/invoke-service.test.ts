import { describe, expect, test, vi, beforeEach } from "vitest";
import type { QueuedInvokeItem } from "@murrmure/hub-core";

const orchestrateInvoke = vi.fn();

vi.mock("@murrmure/hub-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@murrmure/hub-core")>();
  return {
    ...actual,
    orchestrateInvoke: (...args: unknown[]) => orchestrateInvoke(...args),
  };
});

import { createInProcessExecutorPollStore } from "@murrmure/hub-core";
import { InvokeService } from "../../src/invoke-service.js";

function sampleItem(runId: string): QueuedInvokeItem {
  return {
    resolved: {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "queue_until_executor",
    },
    request: {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: runId,
      delivery: "queue_until_executor",
    },
    actor: { actor_id: "actor_test", token_id: "tok_test" },
    step_id: "action:review_url",
    idempotencyKey: `idem-${runId}`,
  };
}

function createService() {
  const executorPollStore = createInProcessExecutorPollStore();
  return new InvokeService(
    {} as never,
    {} as never,
    { publish: vi.fn() } as never,
    {
      onConnect: vi.fn(),
      hasConnectedSession: vi.fn(),
      connectedPrincipals: vi.fn(),
    } as never,
    { executorPollStore } as never,
    {} as never,
  );
}

describe("InvokeService.flushQueuedInvokes", () => {
  beforeEach(() => {
    orchestrateInvoke.mockReset();
  });

  test("re-queues remaining items when drain throws mid-flush", async () => {
    const service = createService();
    const pending = new Map<string, QueuedInvokeItem[]>([
      ["test", [sampleItem("run_1"), sampleItem("run_2"), sampleItem("run_3")]],
    ]);
    (service as { pendingInvokes: Map<string, QueuedInvokeItem[]> }).pendingInvokes = pending;

    orchestrateInvoke
      .mockResolvedValueOnce({ dispatch: { status: "dispatched" } })
      .mockRejectedValueOnce(new Error("journal append failed"));

    await service.flushQueuedInvokes("spc_test");

    expect(orchestrateInvoke).toHaveBeenCalledTimes(2);
    const remaining = pending.get("test") ?? [];
    expect(remaining).toHaveLength(2);
    expect(remaining.map((item) => item.request.run_id)).toEqual(["run_2", "run_3"]);
  });

  test("preserves items enqueued during flush when a later item fails", async () => {
    const service = createService();
    const pending = new Map<string, QueuedInvokeItem[]>([
      ["test", [sampleItem("run_1"), sampleItem("run_2")]],
    ]);
    (service as { pendingInvokes: Map<string, QueuedInvokeItem[]> }).pendingInvokes = pending;

    orchestrateInvoke.mockImplementation(async (_resolved, request, _actor, deps) => {
      if (request.run_id === "run_1") {
        deps.invokeQueue?.enqueue(sampleItem("run_new"));
        return { dispatch: { status: "dispatched" } };
      }
      throw new Error("dispatch failed");
    });

    await service.flushQueuedInvokes("spc_test");

    const remaining = pending.get("test") ?? [];
    expect(remaining.map((item) => item.request.run_id)).toEqual(["run_2", "run_new"]);
  });
});
