import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";

const NESTED_FLOW_BUNDLE = {
  actions: {
    digest: "sha256:rs-actions",
    file: {
      version: 1,
      actions: {
        do_work: { executor: "shell" },
      },
    },
  },
  executors: {
    digest: "sha256:rs-exec",
    file: {
      version: 1,
      executors: {
        shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
      },
    },
  },
  hooks: { digest: "sha256:rs-hooks", file: { version: 1, hooks: {} } },
  handlers: {
    digest: "sha256:rs-handlers",
    file: {
      version: 1,
      handlers: [],
    },
  },
  flows: [
    {
      flow_id: "flw_nested_resolve",
      rel_path: "flows/nested/flow.manifest.yaml",
      digest: "sha256:rs-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "nested-resolve",
        triggers: { manual: true },
        steps: [
          {
            id: "build",
            steps: [
              {
                id: "build-loop",
                branches: {
                  completed: {
                    schema: { type: "object", required: ["preview_url"] },
                    resume: "build",
                  },
                  failed: { schema: { type: "object" }, resume: "build" },
                },
              },
              {
                id: "review",
                branches: {
                  validated: { schema: { type: "object" }, resume: "build" },
                  changes_required: {
                    schema: { type: "object" },
                    resume: "build",
                  },
                  cancel: { schema: { type: "object" }, route: { run: "failed" } },
                },
              },
            ],
            branches: {
              completed: { schema: { type: "object" }, route: { run: "completed" } },
              failed: { schema: { type: "object" }, route: { run: "failed" } },
            },
          },
        ],
      },
    },
  ],
};

describe("http/runs/nested-resolve", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let resolveToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-nested-resolve-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000044";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "nested-resolve", name: "Nested Resolve" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: NESTED_FLOW_BUNDLE }),
    });

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        label: "agent",
        capabilities: ["space:read", "flow:run", "step:resolve"],
      }),
    });
    resolveToken = (await grantRes.json()).token;
  });

  afterAll(() => cleanup?.());

  const agentAuth = () => ({
    Authorization: `Bearer ${resolveToken}`,
    "Content-Type": "application/json",
  });

  async function startRun(): Promise<string> {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ title: "nested", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_nested_resolve/run`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
    });
    const run = (await runRes.json()) as { run_id: string };
    return run.run_id;
  }

  async function openChild(
    runId: string,
    parentStepId: string,
    childStepId: string,
    idempotencyKey: string,
    extra: Record<string, unknown> = {},
  ) {
    return fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(parentStepId)}/children/open`,
      {
        method: "POST",
        headers: agentAuth(),
        body: JSON.stringify({
          child_step_id: childStepId,
          idempotency_key: idempotencyKey,
          ...extra,
        }),
      },
    );
  }

  async function resolve(
    runId: string,
    stepId: string,
    branch: string,
    payload: Record<string, unknown> = {},
  ) {
    return fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/resolve`,
      {
        method: "POST",
        headers: agentAuth(),
        body: JSON.stringify({ branch, payload }),
      },
    );
  }

  test("runs an explicit parent yield, child loop, resume, and parent resolve", async () => {
    const runId = await startRun();

    const before = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: agentAuth() });
    const beforeBody = await before.json() as { steps: Array<{ step_id: string; status: string }> };
    expect(beforeBody.steps.find((step) => step.step_id === "build")?.status).toBe("working");
    expect(beforeBody.steps.find((step) => step.step_id === "build.build-loop")).toBeUndefined();

    expect((await openChild(runId, "build", "build.build-loop", "build-1")).status).toBe(201);
    expect((await openChild(runId, "build", "build.build-loop", "build-1")).status).toBe(200);
    expect((await openChild(runId, "build", "build.review", "other-child")).status).toBe(409);
    expect((await resolve(runId, "build", "completed")).status).toBe(409);

    expect((await resolve(runId, "build.build-loop", "completed", {
      preview_url: "http://127.0.0.1:3000",
    })).status).toBe(200);
    expect((await openChild(runId, "build", "build.review", "review-1")).status).toBe(201);
    expect((await resolve(runId, "build.review", "changes_required")).status).toBe(200);
    expect((await openChild(runId, "build", "build.build-loop", "build-2")).status).toBe(201);
    expect((await resolve(runId, "build.build-loop", "completed", {
      preview_url: "http://127.0.0.1:3001",
    })).status).toBe(200);
    expect((await openChild(runId, "build", "build.review", "review-2")).status).toBe(201);
    expect((await resolve(runId, "build.review", "validated", { approved: true })).status).toBe(200);

    const resumed = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: agentAuth() });
    const resumedBody = await resumed.json() as {
      lifecycle: string;
      open_steps: Array<{
        step_id: string;
        reason?: string;
        declared_children?: string[];
        returned_child?: { step_id: string; branch: string; iteration: number };
      }>;
    };
    expect(resumedBody.lifecycle).toBe("working");
    expect(resumedBody.open_steps).toEqual([
      expect.objectContaining({
        step_id: "build",
        reason: "resumed",
        declared_children: ["build.build-loop", "build.review"],
        returned_child: expect.objectContaining({
          step_id: "build.review",
          branch: "validated",
          iteration: 2,
        }),
      }),
    ]);

    expect((await resolve(runId, "build", "completed")).status).toBe(200);
    const terminal = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: agentAuth() });
    expect((await terminal.json() as { lifecycle: string }).lifecycle).toBe("completed");
    expect((await openChild(runId, "build", "build.build-loop", "build-1")).status).toBe(200);

    const journal = await fetch(`${baseUrl}/v1/journal?space_id=${encodeURIComponent(spaceId)}&limit=100`, {
      headers: { Authorization: `Bearer ${addTokenId(bootstrapToken)}` },
    });
    const entries = (await journal.json() as {
      entries: Array<{ run_id?: string; type: string; seq: number; data?: { step_id?: string } }>;
    }).entries
      .filter((entry) => entry.run_id === runId && [
        JOURNAL_EVENT_TYPES.STEP_OPENED,
        JOURNAL_EVENT_TYPES.STEP_YIELDED,
        JOURNAL_EVENT_TYPES.STEP_RESOLVED,
        JOURNAL_EVENT_TYPES.STEP_RESUMED,
      ].includes(entry.type as typeof JOURNAL_EVENT_TYPES[keyof typeof JOURNAL_EVENT_TYPES]))
      .sort((a, b) => a.seq - b.seq)
      .map((entry) => `${entry.type}:${entry.data?.step_id}`);
    expect(entries).toEqual([
      `${JOURNAL_EVENT_TYPES.STEP_OPENED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_YIELDED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_OPENED}:build.build-loop`,
      `${JOURNAL_EVENT_TYPES.STEP_RESOLVED}:build.build-loop`,
      `${JOURNAL_EVENT_TYPES.STEP_RESUMED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_YIELDED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_OPENED}:build.review`,
      `${JOURNAL_EVENT_TYPES.STEP_RESOLVED}:build.review`,
      `${JOURNAL_EVENT_TYPES.STEP_RESUMED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_YIELDED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_OPENED}:build.build-loop`,
      `${JOURNAL_EVENT_TYPES.STEP_RESOLVED}:build.build-loop`,
      `${JOURNAL_EVENT_TYPES.STEP_RESUMED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_YIELDED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_OPENED}:build.review`,
      `${JOURNAL_EVENT_TYPES.STEP_RESOLVED}:build.review`,
      `${JOURNAL_EVENT_TYPES.STEP_RESUMED}:build`,
      `${JOURNAL_EVENT_TYPES.STEP_RESOLVED}:build`,
    ]);
  });

  test("rejects undeclared input, undeclared children, and idempotency mismatch", async () => {
    const runId = await startRun();
    expect((await openChild(runId, "build", "build.ghost", "ghost")).status).toBe(400);
    expect((await openChild(runId, "build", "build.build-loop", "extra", { input: { unsafe: true } })).status).toBe(400);
    expect((await openChild(runId, "build", "build.build-loop", "same")).status).toBe(201);
    const mismatch = await openChild(runId, "build", "build.review", "same");
    expect(mismatch.status).toBe(409);
    expect((await mismatch.json() as { code: string }).code).toBe("IDEMPOTENCY_MISMATCH");
  });

  test("serializes concurrent child activation", async () => {
    const runId = await startRun();
    const responses = await Promise.all([
      openChild(runId, "build", "build.build-loop", "race-build"),
      openChild(runId, "build", "build.review", "race-review"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  test("returns child failure to the parent unless the branch explicitly fails the run", async () => {
    const resumedRunId = await startRun();
    expect((await openChild(resumedRunId, "build", "build.build-loop", "failed-child")).status).toBe(201);
    expect((await resolve(resumedRunId, "build.build-loop", "failed", { error: "compile" })).status).toBe(200);
    const resumed = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(resumedRunId)}`, { headers: agentAuth() });
    const resumedBody = await resumed.json() as {
      lifecycle: string;
      open_steps: Array<{ step_id: string; returned_child?: { branch: string } }>;
    };
    expect(resumedBody.lifecycle).toBe("working");
    expect(resumedBody.open_steps[0]).toMatchObject({
      step_id: "build",
      returned_child: { branch: "failed" },
    });
    expect((await resolve(resumedRunId, "build", "failed")).status).toBe(200);

    const failedRunId = await startRun();
    expect((await openChild(failedRunId, "build", "build.review", "cancel-review")).status).toBe(201);
    expect((await resolve(failedRunId, "build.review", "cancel")).status).toBe(200);
    const failed = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(failedRunId)}`, { headers: agentAuth() });
    expect((await failed.json() as { lifecycle: string }).lifecycle).toBe("failed");
  });

});
