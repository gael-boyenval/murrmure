import { describe, expect, test } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import {
  orchestrateInvoke,
  type InvokeJournalWriter,
  type InvokeMemoStore,
  type InvokeQueuePort,
  type ResolvedInvoke,
} from "../../../src/invoke/index.js";
import type { DispatchOutcome, ExecutorPort, InvokeRequest } from "@murrmure/runtime-contracts";

const actor = { actor_id: "actor_test", token_id: "tok_test" };

function mockDeps(input: {
  port: ExecutorPort | null;
  memoStore?: InvokeMemoStore;
  journal?: InvokeJournalWriter;
  invokeQueue?: InvokeQueuePort;
}) {
  const memo = new Map<string, DispatchOutcome>();
  const memoStore =
    input.memoStore ??
    ({
      get: (key: string) => memo.get(key) ?? null,
      set: (key: string, outcome: DispatchOutcome) => memo.set(key, outcome),
    } satisfies InvokeMemoStore);

  return {
    deps: {
      registry: {
        getPort: () => input.port,
      },
      memoStore,
      journal: input.journal ?? { append: async () => {} },
      invokeQueue: input.invokeQueue,
      clock: { nowIso: () => new Date().toISOString() },
    },
    memo,
  };
}

describe("invoke/dispatch", () => {
  test("memoizes queued outcomes for idempotent retry", async () => {
    let preflightCount = 0;
    const port: ExecutorPort = {
      preflight: async () => {
        preflightCount += 1;
        return { status: "unreachable", detail: "no mcp" };
      },
      dispatch: async () => ({ status: "executor_unavailable", error_code: "EXECUTOR_UNAVAILABLE" }),
    };
    const { deps, memo } = mockDeps({
      port,
      invokeQueue: { enqueue: () => {} },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "queue_until_executor",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_abc",
      idempotency_key: "idem-queued",
      delivery: "queue_until_executor",
    };

    const first = await orchestrateInvoke(resolved, request, actor, deps);
    const second = await orchestrateInvoke(resolved, request, actor, deps);

    expect(first.dispatch.status).toBe("queued");
    expect(second.dispatch).toEqual(first.dispatch);
    expect(memo.size).toBe(1);
    expect(preflightCount).toBe(1);
  });

  test("does not memoize executor_unavailable outcomes", async () => {
    let preflightCount = 0;
    const port: ExecutorPort = {
      preflight: async () => {
        preflightCount += 1;
        return { status: "unreachable", detail: "no mcp" };
      },
      dispatch: async () => ({ status: "executor_unavailable", error_code: "EXECUTOR_UNAVAILABLE" }),
    };
    const { deps, memo } = mockDeps({ port });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_abc",
      idempotency_key: "idem-unavail",
      delivery: "fail_fast",
    };

    const first = await orchestrateInvoke(resolved, request, actor, deps);
    const second = await orchestrateInvoke(resolved, request, actor, deps);

    expect(first.dispatch.status).toBe("executor_unavailable");
    expect(second.dispatch.status).toBe("executor_unavailable");
    expect(memo.size).toBe(0);
    expect(preflightCount).toBe(2);
  });

  test("returns memoized queued outcome on idempotent retry", async () => {
    let dispatchCount = 0;
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => {
        dispatchCount += 1;
        return { status: "completed", result: { ok: true } };
      },
    };
    const memo = new Map<string, DispatchOutcome>([
      ["idem-stale:run_abc:action:daily_checkin", { status: "queued", step_id: "action:daily_checkin" }],
    ]);
    const { deps } = mockDeps({
      port,
      memoStore: {
        get: (key) => memo.get(key) ?? null,
        set: (key, outcome) => memo.set(key, outcome),
      },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "daily_checkin", executor: "shell", idempotency: "step" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "daily_checkin",
      run_id: "run_abc",
      idempotency_key: "idem-stale",
      delivery: "fail_fast",
    };

    const response = await orchestrateInvoke(resolved, request, actor, deps);

    expect(response.dispatch.status).toBe("queued");
    expect(dispatchCount).toBe(0);
  });

  test("skipMemoLookup bypasses terminal memo for queue drain", async () => {
    let dispatchCount = 0;
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => {
        dispatchCount += 1;
        return { status: "dispatched" };
      },
    };
    const memo = new Map<string, DispatchOutcome>([
      [
        "idem-drain:run_drain:action:review_url",
        { status: "completed", step_id: "action:review_url", result: { stale: true } },
      ],
    ]);
    const { deps } = mockDeps({
      port,
      memoStore: {
        get: (key) => memo.get(key) ?? null,
        set: (key, outcome) => memo.set(key, outcome),
      },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "queue_until_executor",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_drain",
      idempotency_key: "idem-drain",
      delivery: "queue_until_executor",
    };

    const response = await orchestrateInvoke(resolved, request, actor, deps, { skipMemoLookup: true });

    expect(response.dispatch.status).toBe("dispatched");
    expect(dispatchCount).toBe(1);
  });

  test("enqueues when dispatch returns queued after reachable preflight", async () => {
    const queued: Parameters<InvokeQueuePort["enqueue"]>[0][] = [];
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => ({
        status: "queued",
        run_id: "run_race",
        step_id: "action:review_url",
        detail: "MCP session dropped before publish",
      }),
    };
    const { deps } = mockDeps({
      port,
      invokeQueue: { enqueue: (item) => queued.push(item) },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "queue_until_executor",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_race",
      idempotency_key: "idem-race",
      delivery: "queue_until_executor",
    };

    const response = await orchestrateInvoke(resolved, request, actor, deps);

    expect(response.dispatch.status).toBe("queued");
    expect(queued).toHaveLength(1);
    expect(queued[0]!.request.run_id).toBe("run_race");
  });

  test("queued drain re-dispatches when executor becomes reachable", async () => {
    let reachable = false;
    let dispatchCount = 0;
    const port: ExecutorPort = {
      preflight: async () =>
        reachable ? { status: "reachable" } : { status: "unreachable", detail: "no mcp" },
      dispatch: async () => {
        dispatchCount += 1;
        return { status: "dispatched" };
      },
    };
    const queued: Parameters<InvokeQueuePort["enqueue"]>[0][] = [];
    const { deps, memo } = mockDeps({
      port,
      invokeQueue: { enqueue: (item) => queued.push(item) },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "queue_until_executor",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_flush",
      idempotency_key: "idem-flush",
      delivery: "queue_until_executor",
    };

    const queuedResponse = await orchestrateInvoke(resolved, request, actor, deps);
    expect(queuedResponse.dispatch.status).toBe("queued");
    expect(queued).toHaveLength(1);
    expect(memo.size).toBe(1);

    reachable = true;
    const drained = await orchestrateInvoke(
      queued[0]!.resolved,
      queued[0]!.request,
      queued[0]!.actor,
      deps,
      { skipMemoLookup: true },
    );

    expect(drained.dispatch.status).toBe("dispatched");
    expect(dispatchCount).toBe(1);
  });

  test("journals action.failed for sync non-timeout failures", async () => {
    const journalTypes: string[] = [];
    const journal: InvokeJournalWriter = {
      append: async (input) => {
        journalTypes.push(input.type);
      },
    };
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => ({
        status: "failed",
        error_code: "RESPONSE_NOT_JSON",
        detail: "shell_spawn expects stdout JSON",
      }),
    };
    const { deps } = mockDeps({ port, journal });
    const resolved: ResolvedInvoke = {
      action: { name: "daily_checkin", executor: "shell", command: "echo" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "daily_checkin",
      delivery: "fail_fast",
    };

    const response = await orchestrateInvoke(resolved, request, actor, deps);

    expect(response.dispatch.status).toBe("failed");
    expect(response.dispatch.error_code).toBe("RESPONSE_NOT_JSON");
    expect(journalTypes).toEqual([
      JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
      JOURNAL_EVENT_TYPES.ACTION_FAILED,
    ]);
  });

  test("journals action.timed_out for timeout failures", async () => {
    const journalTypes: string[] = [];
    const journal: InvokeJournalWriter = {
      append: async (input) => {
        journalTypes.push(input.type);
      },
    };
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => ({
        status: "failed",
        error_code: "ACTION_TIMED_OUT",
        detail: "Command timed out after 50ms",
      }),
    };
    const { deps } = mockDeps({ port, journal });

    const response = await orchestrateInvoke(
      {
        action: { name: "slow_task", executor: "shell" },
        binding: { type: "shell_spawn", executor_id: "shell" },
        delivery: "fail_fast",
      },
      { space_id: "spc_test", action_name: "slow_task", delivery: "fail_fast" },
      actor,
      deps,
    );

    expect(response.dispatch.status).toBe("failed");
    expect(journalTypes).toEqual([
      JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
      JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT,
    ]);
  });

  test("memoizes dispatched outcomes for idempotent retry", async () => {
    let dispatchCount = 0;
    let journalCount = 0;
    const journal: InvokeJournalWriter = {
      append: async () => {
        journalCount += 1;
      },
    };
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => {
        dispatchCount += 1;
        return { status: "dispatched" };
      },
    };
    const { deps } = mockDeps({ port, journal });
    const resolved: ResolvedInvoke = {
      action: { name: "review_url", executor: "cursor-mcp", idempotency: "step" },
      binding: { type: "mcp_session", executor_id: "cursor-mcp" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      run_id: "run_disp",
      idempotency_key: "idem-disp",
      delivery: "fail_fast",
    };

    const first = await orchestrateInvoke(resolved, request, actor, deps);
    const second = await orchestrateInvoke(resolved, request, actor, deps);

    expect(first.dispatch.status).toBe("dispatched");
    expect(second.dispatch).toEqual(first.dispatch);
    expect(dispatchCount).toBe(1);
    expect(journalCount).toBe(1);
  });

  test("rejects completed invoke when result exceeds inline cap", async () => {
    const journalTypes: string[] = [];
    const journal: InvokeJournalWriter = {
      append: async (input) => {
        journalTypes.push(input.type);
      },
    };
    const oversized = { blob: "x".repeat(70_000) };
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => ({ status: "completed", result: oversized }),
    };
    const { deps } = mockDeps({ port, journal });
    const resolved: ResolvedInvoke = {
      action: { name: "daily_checkin", executor: "shell", idempotency: "step" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "daily_checkin",
      run_id: "run_big",
      delivery: "fail_fast",
    };

    const response = await orchestrateInvoke(resolved, request, actor, deps);

    expect(response.dispatch.status).toBe("failed");
    expect(response.dispatch.error_code).toBe("INLINE_PAYLOAD_EXCEEDED");
    expect(response.body).toBeUndefined();
    expect(journalTypes).toEqual([
      JOURNAL_EVENT_TYPES.ACTION_DISPATCHED,
      JOURNAL_EVENT_TYPES.ACTION_FAILED,
    ]);
  });

  test("memoizes completed outcomes for idempotent redispatch", async () => {
    let dispatchCount = 0;
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      dispatch: async () => {
        dispatchCount += 1;
        return { status: "completed", result: { n: 1 } };
      },
    };
    const { deps } = mockDeps({ port });
    const resolved: ResolvedInvoke = {
      action: { name: "daily_checkin", executor: "shell", idempotency: "step" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "daily_checkin",
      run_id: "run_abc",
      idempotency_key: "idem-1",
      delivery: "fail_fast",
    };

    const first = await orchestrateInvoke(resolved, request, actor, deps);
    const second = await orchestrateInvoke(resolved, request, actor, deps);

    expect(first.dispatch.status).toBe("completed");
    expect(second.dispatch).toEqual(first.dispatch);
    expect(dispatchCount).toBe(1);
  });

  test("ACTION_DISPATCHED includes resolved shell command and prompt", async () => {
    const journalData: Record<string, unknown>[] = [];
    const port: ExecutorPort = {
      preflight: async () => ({ status: "reachable" }),
      resolveDispatchAudit: async () => ({
        command: "cursor agent -p --force",
        prompt: "hello world",
        cwd: "/space/root",
      }),
      dispatch: async () => ({ status: "dispatched" }),
    };
    const { deps } = mockDeps({
      port,
      journal: {
        append: async (input) => {
          journalData.push(input.data);
        },
      },
    });
    const resolved: ResolvedInvoke = {
      action: {
        name: "feature_write_spec",
        executor: "shell",
        command: "cursor agent -p --force {{prompt}}",
        prompt: "hello world",
        idempotency: "step",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/space/root",
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "feature_write_spec",
      run_id: "run_abc",
      step_id: "write_spec",
      delivery: "fail_fast",
    };

    let auditCaptured: unknown;
    await orchestrateInvoke(resolved, request, actor, deps, {
      onDispatchAudit: async (input) => {
        auditCaptured = input.audit;
      },
    });

    expect(journalData[0]).toMatchObject({
      executor_type: "shell_spawn",
      command: "cursor agent -p --force",
      prompt: "hello world",
      cwd: "/space/root",
    });
    expect(auditCaptured).toEqual({
      command: "cursor agent -p --force",
      prompt: "hello world",
      cwd: "/space/root",
    });
  });
});
