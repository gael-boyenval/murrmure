import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { createExecutorRegistry } from "../src/registry.js";
import {
  orchestrateInvoke,
  type InvokeJournalWriter,
  type InvokeMemoStore,
  type ResolvedInvoke,
} from "@murrmure/hub-core";
import type { DispatchContext, InvokeRequest } from "@murrmure/runtime-contracts";

const binding = { type: "mcp_session" as const, executor_id: "cursor" };
const context: DispatchContext = {
  action: { name: "review_url" },
  binding,
};

describe("executor conformance", () => {
  test("mcp_session unreachable fails fast", async () => {
    const registry = createExecutorRegistry({
      mcpSession: {
        isReachable: () => false,
        publish: () => {},
      },
    });
    const port = registry.getPort(binding)!;
    const preflight = await port.preflight(binding, { space_id: "spc_test" });
    expect(preflight.status).toBe("unreachable");

    const invoke: InvokeRequest = {
      space_id: "spc_test",
      action_name: "review_url",
      delivery: "fail_fast",
    };
    const outcome = await port.dispatch(invoke, context);
    expect(outcome.status).toBe("executor_unavailable");
    expect(outcome.error_code).toBe("EXECUTOR_UNAVAILABLE");
  });

  test("mcp_session reachable dispatches", async () => {
    const published: unknown[] = [];
    const registry = createExecutorRegistry({
      mcpSession: {
        isReachable: () => true,
        publish: (_space, msg) => published.push(msg),
      },
    });
    const port = registry.getPort(binding)!;
    const preflight = await port.preflight(binding, { space_id: "spc_test" });
    expect(preflight.status).toBe("reachable");

    const outcome = await port.dispatch(
      { space_id: "spc_test", action_name: "review_url", params: { url: "https://x" } },
      context,
    );
    expect(outcome.status).toBe("dispatched");
    expect(published).toHaveLength(1);
  });

  test("shell_spawn completes with JSON stdout", async () => {
    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      shellSpawn: {
        spawn: () => {
          const child = new EventEmitter() as NodeJS.EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: () => void;
          };
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          process.nextTick(() => {
            child.stdout.emit("data", Buffer.from('{"ok":true}\n'));
            child.emit("close", 0);
          });
          return child;
        },
      },
    });
    const shellBinding = { type: "shell_spawn" as const, executor_id: "shell" };
    const port = registry.getPort(shellBinding)!;
    const outcome = await port.dispatch(
      { space_id: "spc_test", action_name: "daily_checkin" },
      {
        action: { name: "daily_checkin", command: "echo" },
        binding: shellBinding,
        space_root: "/tmp/project",
      },
    );
    expect(outcome.status).toBe("completed");
    expect(outcome.result).toEqual({ ok: true });
  });

  test("shell_spawn timeout returns ACTION_TIMED_OUT", async () => {
    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      shellSpawn: {
        spawn: () => {
          const child = new EventEmitter() as NodeJS.EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: (signal?: NodeJS.Signals) => void;
          };
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          child.kill = () => {};
          return child;
        },
      },
    });
    const shellBinding = { type: "shell_spawn" as const, executor_id: "shell" };
    const port = registry.getPort(shellBinding)!;
    const outcome = await port.dispatch(
      { space_id: "spc_test", action_name: "slow_task" },
      {
        action: { name: "slow_task", command: "sleep 60", timeout_ms: 50 },
        binding: shellBinding,
        space_root: "/tmp/project",
      },
    );
    expect(outcome.status).toBe("failed");
    expect(outcome.error_code).toBe("ACTION_TIMED_OUT");
  });

  test("orchestrator journals timed_out on shell timeout", async () => {
    const journalTypes: string[] = [];
    const journal: InvokeJournalWriter = {
      append: async (input) => {
        journalTypes.push(input.type);
      },
    };
    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      shellSpawn: {
        spawn: () => {
          const child = new EventEmitter() as NodeJS.EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: () => void;
          };
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          child.kill = () => {};
          return child;
        },
      },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "slow_task", executor: "shell", command: "sleep 60", timeout_ms: 50 },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/project",
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "slow_task",
      delivery: "fail_fast",
    };
    const memoStore: InvokeMemoStore = { get: () => null, set: () => {} };

    const response = await orchestrateInvoke(resolved, request, { actor_id: "actor_test", token_id: "tok_test" }, {
      registry,
      memoStore,
      journal,
      clock: { nowIso: () => new Date().toISOString() },
    });

    expect(response.dispatch.status).toBe("failed");
    expect(response.dispatch.error_code).toBe("ACTION_TIMED_OUT");
    expect(journalTypes).toContain(JOURNAL_EVENT_TYPES.ACTION_DISPATCHED);
    expect(journalTypes).toContain(JOURNAL_EVENT_TYPES.ACTION_TIMED_OUT);
  });

  test("idempotent redispatch returns memo without re-executing", async () => {
    let dispatchCount = 0;
    const registry = createExecutorRegistry({
      mcpSession: { isReachable: () => false, publish: () => {} },
      shellSpawn: {
        spawn: () => {
          dispatchCount += 1;
          const child = new EventEmitter() as NodeJS.EventEmitter & {
            stdout: EventEmitter;
            stderr: EventEmitter;
            kill: () => void;
          };
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          process.nextTick(() => {
            child.stdout.emit("data", Buffer.from('{"n":1}\n'));
            child.emit("close", 0);
          });
          return child;
        },
      },
    });
    const resolved: ResolvedInvoke = {
      action: { name: "daily_checkin", executor: "shell", command: "echo", idempotency: "step" },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/project",
      delivery: "fail_fast",
    };
    const request: InvokeRequest = {
      space_id: "spc_test",
      action_name: "daily_checkin",
      run_id: "run_abc",
      delivery: "fail_fast",
      idempotency_key: "idem-1",
    };
    const memo = new Map<string, import("@murrmure/runtime-contracts").DispatchOutcome>();
    const memoStore: InvokeMemoStore = {
      get: (key) => memo.get(key) ?? null,
      set: (key, outcome) => memo.set(key, outcome),
    };
    const journal: InvokeJournalWriter = { append: async () => {} };
    const deps = {
      registry,
      memoStore,
      journal,
      clock: { nowIso: () => new Date().toISOString() },
    };
    const actor = { actor_id: "actor_test", token_id: "tok_test" };

    const first = await orchestrateInvoke(resolved, request, actor, deps);
    const second = await orchestrateInvoke(resolved, request, actor, deps);

    expect(first.dispatch.status).toBe("completed");
    expect(first.body).toEqual({ n: 1 });
    expect(second.dispatch.status).toBe("completed");
    expect(second.dispatch).toEqual(first.dispatch);
    expect(dispatchCount).toBe(1);
  });
});
