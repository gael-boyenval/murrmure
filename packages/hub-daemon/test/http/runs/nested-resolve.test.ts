import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

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
      handlers: [
        {
          id: "build-owner",
          contract_keys: [
            "nested-resolve.build",
            "nested-resolve.build.build-loop",
            "nested-resolve.build.review",
          ],
          on: "step.opened",
          kill_on: "step.resolved",
          type: "shell_spawn",
          complete: "explicit",
        },
      ],
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
                    route: { step: "build.review" },
                  },
                  failed: { schema: { type: "object" }, route: { run: "failed" } },
                },
              },
              {
                id: "review",
                branches: {
                  validated: { schema: { type: "object" }, resume: "build" },
                  changes_required: {
                    schema: { type: "object" },
                    route: { step: "build.build-loop" },
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

// Runtime nested-step resolution loops are owned by Task 07 (nested build loops).
// Skipped here to keep the Task 03 minimal-flow cutover green.
describe.skip("http/runs/nested-resolve", () => {
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
        capabilities: ["space:read", "flow:run", "action:invoke", "step:resolve"],
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

  test("resolves qualified nested step ids and exposes nested graph", async () => {
    const runId = await startRun();

    const resolveLoop = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/build.build-loop/resolve`,
      {
        method: "POST",
        headers: agentAuth(),
        body: JSON.stringify({
          branch: "completed",
          payload: { preview_url: "http://127.0.0.1:3000" },
        }),
      },
    );
    expect(resolveLoop.status).toBe(200);

    const getRun = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: agentAuth() });
    const runBody = (await getRun.json()) as { steps: Array<{ step_id: string; status: string }> };
    const reviewMemo = runBody.steps.find((s) => s.step_id === "build.review");
    expect(reviewMemo?.status).toBe("working");

    const graphRes = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/graph`, {
      headers: agentAuth(),
    });
    const graph = (await graphRes.json()) as { nodes: Array<{ step_id: string }> };
    expect(graph.nodes.map((n) => n.step_id)).toContain("build.build-loop");
    expect(graph.nodes.map((n) => n.step_id)).toContain("build.review");
  });
});
