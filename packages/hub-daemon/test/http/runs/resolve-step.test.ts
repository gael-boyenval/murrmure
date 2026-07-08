import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

const LINEAR_FLOW_BUNDLE = {
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
  flows: [
    {
      flow_id: "flw_linear_resolve",
      rel_path: "flows/linear/flow.manifest.yaml",
      digest: "sha256:rs-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "linear-resolve",
        start: { manual: true },
        steps: [
          {
            id: "intake",
            presentation: { view: "intake-view" },
            branches: {
              continue: { schema: { type: "object", required: ["topic"] }, next: "work" },
              cancel: { schema: { type: "object" }, fail_run: true },
            },
          },
          {
            id: "work",
            executor: { action: "do_work" },
            branches: {
              completed: { schema: { type: "object" }, next: null },
              failed: { schema: { type: "object" }, fail_run: true },
            },
          },
        ],
      },
    },
  ],
};

describe("http/runs/resolve-step", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let resolveToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-resolve-step-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000033";
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
      body: JSON.stringify({ slug: "resolve-step", name: "Resolve Step" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ bundle: LINEAR_FLOW_BUNDLE }),
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
      body: JSON.stringify({ title: "resolve test", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_linear_resolve/run`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
    });
    const runBody = (await runRes.json()) as { run_id: string };
    return runBody.run_id;
  }

  test("POST resolve advances intake to work", async () => {
    const runId = await startRun();

    const resolveRes = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/intake/resolve`,
      {
        method: "POST",
        headers: agentAuth(),
        body: JSON.stringify({
          branch: "continue",
          payload: { topic: "ai" },
        }),
      },
    );
    expect(resolveRes.status).toBe(200);

    const getRun = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}`, {
      headers: agentAuth(),
    });
    const runDetail = (await getRun.json()) as {
      exec_context?: { input?: Record<string, unknown> };
    };
    expect(runDetail.exec_context?.input?.topic).toBe("ai");
  });

  test("wrong branch returns 400", async () => {
    const runId = await startRun();
    const res = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/intake/resolve`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({ branch: "missing_branch" }),
    });
    expect(res.status).toBe(400);
  });

  test("idempotent resolve returns 200 when idempotency_key matches completed step", async () => {
    const runId = await startRun();
    const body = {
      branch: "continue",
      payload: { topic: "idem" },
      idempotency_key: "resolve-idem-1",
    };
    const first = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/intake/resolve`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify(body),
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${baseUrl}/v1/runs/${encodeURIComponent(runId)}/steps/intake/resolve`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify(body),
    });
    expect(second.status).toBe(200);
  });

  test("MCP murrmure_resolve_step proxies resolve endpoint", async () => {
    const runId = await startRun();
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: agentAuth(),
      body: JSON.stringify({
        name: "murrmure_resolve_step",
        arguments: {
          run_id: runId,
          step_id: "intake",
          branch: "continue",
          payload: { topic: "mcp" },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { ok?: boolean } };
    expect(body.result?.ok).toBe(true);
  });
});
