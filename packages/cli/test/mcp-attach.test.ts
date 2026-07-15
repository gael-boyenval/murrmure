import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../hub-daemon/src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("mcp/murrmure_attach_orchestration", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let token: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-attach-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000013";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    spaceId = ((await (await fetch(`${baseUrl}/v1/spaces`, { method: "POST", headers: auth, body: JSON.stringify({ slug: "mcp-attach", name: "MCP Attach" }) })).json()) as { space_id: string }).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: { digest: "sha256:a", file: { version: 1, actions: { noop: { executor: "shell" } } } },
          executors: { digest: "sha256:e", file: { version: 1, executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } } } },
          hooks: { digest: "sha256:h", file: { version: 1, hooks: {} } },
          flows: [],
          views: [],
        },
      }),
    });

    token = ((await (await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, { method: "POST", headers: auth, body: JSON.stringify({ label: "mcp-agent", scopes: ["space:read", "flow:run", "flow:read"] }) })).json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("murrmure_attach_orchestration and murrmure_get_run_graph round-trip", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "murrmure_create_session",
        space_id: spaceId,
        arguments: { title: "MCP attach", space_id: spaceId },
      }),
    });
    const sessionBody = (await sessionRes.json()) as { result: { session_id: string } };
    const session_id = sessionBody.result.session_id;

    const attachRes = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "murrmure_attach_orchestration",
        space_id: spaceId,
        arguments: {
          session_id,
          space_id: spaceId,
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "mcp-proposed",
            triggers: { manual: true },
            steps: [
              {
                id: "step1",
                description: "Proposed step",
                branches: {
                  completed: { schema: { type: "object" }, route: { run: "completed" } },
                  failed: { schema: { type: "object" }, route: { run: "failed" } },
                },
              },
            ],
          },
        },
      }),
    });
    expect(attachRes.status).toBe(200);
    const attachBody = (await attachRes.json()) as { result: { run_id: string; gate_id: string } };
    const attachResult = attachBody.result;
    expect(attachResult.run_id).toMatch(/^run_/);
    expect(attachResult.gate_id).toMatch(/^chk_|^gate_/);

    const graphRes = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "murrmure_get_run_graph",
        space_id: spaceId,
        arguments: { run_id: attachResult.run_id },
      }),
    });
    expect(graphRes.status).toBe(200);
    const graphBody = (await graphRes.json()) as { result: { nodes: unknown[] } };
    const graph = graphBody.result;
    expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
  });

  test("MCP catalog includes attach and graph tools", async () => {
    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const names = ((await catalog.json()) as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toContain("murrmure_attach_orchestration");
    expect(names).toContain("murrmure_get_run_graph");
  });
});
