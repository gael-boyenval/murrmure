import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

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

  test("action invoke route is removed — no task offer via public route (404)", async () => {
    await ctx.registerWorker();

    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "linux" } }),
    });
    expect(invokeRes.status).toBe(404);
  });
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

  test("action invoke route is removed — foreign-task complete path not reachable via invoke (404)", async () => {
    await ctx.registerWorker();

    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: {} }),
    });
    expect(invokeRes.status).toBe(404);
  });
});

describe("http/executor/tasks-complete", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-complete");
  });

  afterAll(() => ctx.cleanup());

  test("executor binding is indexed as queue_poll", async () => {
    const executorsRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/executors`, {
      headers: ctx.bootstrap,
    });
    const executorsBody = await executorsRes.json();
    expect(executorsBody.executors?.[0]?.binding?.type).toBe("queue_poll");
  });

  test("action invoke route is removed — complete path not reachable via invoke (404)", async () => {
    const invokeRes = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "linux" } }),
    });
    expect(invokeRes.status).toBe(404);
  });
});

describe("http/executor/tasks-stale", () => {
  let ctx: Awaited<ReturnType<typeof setupQueuePollHub>>;

  beforeAll(async () => {
    ctx = await setupQueuePollHub("qp-stale");
  });

  afterAll(() => ctx.cleanup());

  test("action invoke route is removed — stale worker not reachable via invoke (404)", async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/spaces/${ctx.spaceId}/actions/build/invoke`, {
      method: "POST",
      headers: ctx.bootstrap,
      body: JSON.stringify({ params: { target: "offline" } }),
    });
    expect(res.status).toBe(404);
  });
});
