import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

async function setupQueuePollHub(slug = "queue-poll") {
  const dir = mkdtempSync(join(tmpdir(), "hub-exec-poll-"));
  const bootstrapToken = "01JBOOTSTRAPTOKEN00000050";
  const daemon = await startHubDaemon({
    databasePath: join(dir, "murrmure.db"),
    port: 0,
    dataDir: join(dir, "data"),
    defaultSpaceId: "",
    bootstrapToken,
  });
  const addr = daemon.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 8787;
  const baseUrl = `http://127.0.0.1:${port}`;

  const bootstrap = {
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  };

  const created = await fetch(`${baseUrl}/v1/spaces`, {
    method: "POST",
    headers: bootstrap,
    body: JSON.stringify({ slug, name: slug }),
  });
  const spaceId = (await created.json()).space_id as string;
  const executorId = "remote-build";

  await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
    method: "POST",
    headers: bootstrap,
    body: JSON.stringify({
      bundle: {
        actions: {
          digest: "sha256:qp-actions",
          file: {
            version: 1,
            actions: {
              build: { executor: "remote-build" },
            },
          },
        },
        executors: {
          digest: "sha256:qp-exec",
          file: {
            executors: {
              "remote-build": {
                binding: { type: "queue_poll", executor_id: executorId },
              },
            },
          },
        },
        flows: [],
        views: [],
      },
    }),
  });

  const grant = await fetch(`${baseUrl}/v1/grants`, {
    method: "POST",
    headers: bootstrap,
    body: JSON.stringify({
      space_id: spaceId,
      label: "queue-worker",
      capabilities: ["executor:poll"],
      harness: executorId,
    }),
  });
  const workerToken = (await grant.json()).token as string;

  const readGrant = await fetch(`${baseUrl}/v1/grants`, {
    method: "POST",
    headers: bootstrap,
    body: JSON.stringify({
      space_id: spaceId,
      label: "read-only",
      capabilities: ["space:read"],
    }),
  });
  const readToken = (await readGrant.json()).token as string;

  async function registerWorker(timeout_ms = 50) {
    await fetch(
      `${baseUrl}/v1/executor/tasks?executor_id=${executorId}&timeout_ms=${timeout_ms}`,
      { headers: { Authorization: `Bearer ${workerToken}` } },
    );
  }

  return {
    baseUrl,
    bootstrapToken,
    workerToken,
    readToken,
    spaceId,
    executorId,
    bootstrap,
    registerWorker,
    cleanup: () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("http/executor/tasks-poll", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-poll");
    await ctx.registerWorker();
  });

  afterAll(() => ctx.cleanup());

  test("long-poll returns empty array when no tasks", async () => {
    await ctx.registerWorker();
    const res = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks?executor_id=${ctx.executorId}&timeout_ms=200`,
      { headers: { Authorization: `Bearer ${ctx.workerToken}` } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("poll receives task offer after invoke when worker is reachable", async () => {
    await ctx.registerWorker();

    const pollPromise = fetch(
      `${ctx.baseUrl}/v1/executor/tasks?executor_id=${ctx.executorId}&timeout_ms=3000`,
      { headers: { Authorization: `Bearer ${ctx.workerToken}` } },
    );

    await new Promise((r) => setTimeout(r, 150));

    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "linux" } }),
    });
    expect(invokeRes.status).toBe(200);
    const invokeBody = await invokeRes.json();
    expect(invokeBody.dispatch.status).toBe("dispatched");

    const pollRes = await pollPromise;
    expect(pollRes.status).toBe(200);
    const tasks = (await pollRes.json()) as Array<{ action_name: string; params: Record<string, unknown> }>;
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks[0]?.action_name).toBe("build");
    expect(tasks[0]?.params).toEqual({ target: "linux" });
  }, 10_000);
});

describe("http/executor/tasks-auth", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-auth");
  });

  afterAll(() => ctx.cleanup());

  test("unauthorized worker denied without executor:poll", async () => {
    const res = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks?executor_id=${ctx.executorId}&timeout_ms=50`,
      { headers: { Authorization: `Bearer ${ctx.readToken}` } },
    );
    expect(res.status).toBe(403);
  });

  test("worker with wrong harness cannot complete foreign task", async () => {
    await ctx.registerWorker();

    const wrongGrant = await fetch(`${ctx.baseUrl}/v1/grants`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({
        space_id: ctx.spaceId,
        label: "other-worker",
        capabilities: ["executor:poll"],
        harness: "other-executor",
      }),
    });
    const otherToken = (await wrongGrant.json()).token as string;

    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: {} }),
    });
    expect(invokeRes.status).toBe(200);

    const pollRes = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks?executor_id=${ctx.executorId}&timeout_ms=2000`,
      { headers: { Authorization: `Bearer ${ctx.workerToken}` } },
    );
    const tasks = (await pollRes.json()) as Array<{ task_id: string }>;
    expect(tasks.length).toBe(1);

    const completeRes = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks/${tasks[0]!.task_id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${otherToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result: { ok: true } }),
      },
    );
    expect(completeRes.status).toBe(403);
  });
});

describe("http/executor/tasks-complete", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-complete");
  });

  afterAll(() => ctx.cleanup());

  test("complete journals action.completed and updates run step memo", async () => {
    await ctx.registerWorker();

    const executorsRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/executors`, {
      headers: ctx.bootstrap,
    });
    const executorsBody = await executorsRes.json();
    expect(executorsBody.executors?.[0]?.binding?.type).toBe("queue_poll");

    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "linux" } }),
    });
    const invokeBody = await invokeRes.json();
    expect(invokeRes.status).toBe(200);
    expect(invokeBody.dispatch?.status).toBe("dispatched");
    const runId = invokeBody.dispatch.run_id as string;

    const pollRes = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks?executor_id=${ctx.executorId}&timeout_ms=2000`,
      { headers: { Authorization: `Bearer ${ctx.workerToken}` } },
    );
    const tasks = (await pollRes.json()) as Array<{ task_id: string }>;
    expect(tasks.length).toBe(1);

    const completeRes = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks/${tasks[0]!.task_id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.workerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result: { artifact: "built.bin" } }),
      },
    );
    expect(completeRes.status).toBe(200);

    const duplicate = await fetch(
      `${ctx.baseUrl}/v1/executor/tasks/${tasks[0]!.task_id}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.workerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result: { artifact: "built.bin" } }),
      },
    );
    expect(duplicate.status).toBe(200);

    const runRes = await fetch(`${ctx.baseUrl}/v1/runs/${runId}`, {
      headers: ctx.bootstrap,
    });
    expect(runRes.status).toBe(200);
    const run = await runRes.json();
    const memo = (run.steps as Array<{ step_id: string; status: string }>).find(
      (s) => s.step_id === "action:build",
    );
    expect(memo?.status).toBe("completed");

    const eventsRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/events?from_seq=0`, {
      headers: ctx.bootstrap,
    });
    expect(eventsRes.status).toBe(200);
    const { events } = (await eventsRes.json()) as { events: Array<{ type: string }> };
    expect(events.some((e) => e.type === JOURNAL_EVENT_TYPES.ACTION_COMPLETED)).toBe(true);
  });
});

describe("http/executor/tasks-stale", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-stale");
  });

  afterAll(() => ctx.cleanup());

  test("stale worker invoke returns EXECUTOR_UNAVAILABLE", async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "offline" } }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.dispatch.status).toBe("executor_unavailable");
    expect(body.dispatch.error_code).toBe("EXECUTOR_UNAVAILABLE");
  });
});
