import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

const LINEAR_FLOW_BUNDLE = {
  actions: {
    digest: "sha256:sc-actions",
    file: {
      version: 1,
      actions: {
        do_work: { executor: "shell" },
      },
    },
  },
  executors: {
    digest: "sha256:sc-exec",
    file: {
      version: 1,
      executors: {
        shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
      },
    },
  },
  hooks: { digest: "sha256:sc-hooks", file: { version: 1, hooks: {} } },
  flows: [
    {
      flow_id: "flw_step_contracts",
      rel_path: "flows/step-contracts/flow.manifest.yaml",
      digest: "sha256:sc-flow",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "step-contracts-list",
        start: { manual: true },
        steps: [
          {
            id: "intake",
            presentation: { view: "intake-view" },
            branches: {
              continue: { schema: { type: "object" }, next: "work" },
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

describe("http/runs/step-contracts", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let readToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-step-contracts-"));
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
      body: JSON.stringify({ slug: "step-contracts", name: "Step Contracts" }),
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
        label: "reader",
        capabilities: ["space:read", "flow:run", "step:resolve"],
      }),
    });
    readToken = (await grantRes.json()).token;
  });

  afterAll(() => cleanup?.());

  const readerAuth = () => ({
    Authorization: `Bearer ${readToken}`,
    "Content-Type": "application/json",
  });

  async function startRun(): Promise<string> {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: readerAuth(),
      body: JSON.stringify({ title: "step contracts", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/flows/flw_step_contracts/run`, {
      method: "POST",
      headers: readerAuth(),
      body: JSON.stringify({ session_id: session.session_id, space_id: spaceId, input: {} }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as { run_id: string };
    return runBody.run_id;
  }

  test("GET /v1/runs/:run_id/step-contracts returns active slice", async () => {
    const run_id = await startRun();

    const listRes = await fetch(`${baseUrl}/v1/runs/${run_id}/step-contracts`, {
      headers: readerAuth(),
    });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as {
      run_id: string;
      active: { step_id: string; branches: Record<string, { then: string }> } | null;
      graph_digest: string;
      callable: unknown[];
    };

    expect(body.run_id).toBe(run_id);
    expect(body.active?.step_id).toBe("intake");
    expect(body.active?.branches.continue?.then).toBe("engine opens work");
    expect(body.graph_digest).toMatch(/^sha256:/);
    expect(body.callable).toEqual([]);
  });

  test("MCP murrmure_list_step_contracts mirrors HTTP endpoint", async () => {
    const run_id = await startRun();

    const mcpRes = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: readerAuth(),
      body: JSON.stringify({
        name: "murrmure_list_step_contracts",
        arguments: { run_id },
      }),
    });
    expect(mcpRes.status).toBe(200);
    const body = (await mcpRes.json()) as {
      result: { active: { step_id: string } | null; graph_digest: string };
    };
    expect(body.result.active?.step_id).toBe("intake");
    expect(body.result.graph_digest).toMatch(/^sha256:/);
  });
});
