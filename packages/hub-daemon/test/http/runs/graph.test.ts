import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("runs/graph", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "run-graph-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    spaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "graph-space", name: "Graph" }),
      })
    ).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:graph-action",
            file: { version: 1, actions: { noop: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:graph-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: {
            digest: "sha256:graph-hooks",
            file: { version: 1, hooks: {} },
          },
          flows: [
            {
              flow_id: "flw_morning_brief",
              rel_path: "flows/morning-brief/flow.manifest.yaml",
              digest: "sha256:graph-flow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "morning-brief",
                triggers: { manual: true },
                steps: [
                  { id: "research", description: "research" },
                  { id: "finish", description: "finish" },
                ],
              },
            },
          ],
          views: [],
        },
      }),
    });

    token = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "graph-agent",
            scopes: ["space:read", "flow:run"],
          }),
        })
      ).json()
    ).token;
  });

  afterAll(() => cleanup?.());

  test("graph API returns manifest overlay nodes and edges", async () => {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const started = await fetch(`${baseUrl}/v1/flows/flw_morning_brief/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(started.status).toBe(201);
    const { run_id } = (await started.json()) as { run_id: string };

    const graphRes = await fetch(`${baseUrl}/v1/runs/${run_id}/graph`, { headers });
    expect(graphRes.status).toBe(200);
    const graph = await graphRes.json();
    expect(graph.run_id).toBe(run_id);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.nodes.some((n: { step_id: string }) => n.step_id === "research")).toBe(true);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    const runDetail = await fetch(`${baseUrl}/v1/runs/${run_id}`, { headers }).then(
      (response) => response.json(),
    );
    expect(runDetail.exec_context).not.toHaveProperty("_flow_snapshot");

    const adminHeaders = {
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    };
    for (const stepId of ["research", "finish"]) {
      const resolved = await fetch(
        `${baseUrl}/v1/runs/${run_id}/steps/${stepId}/resolve`,
        {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({ branch: "completed", payload: {} }),
        },
      );
      expect(resolved.status).toBe(200);
    }

    const reapplied = await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        bundle: {
          flows: [
            {
              flow_id: "flw_morning_brief",
              rel_path: "flows/morning-brief/flow.manifest.yaml",
              digest: "sha256:graph-flow-v2",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "morning-brief",
                triggers: { manual: true },
                steps: [
                  { id: "research", description: "changed research" },
                  { id: "publish", description: "new current step" },
                ],
              },
            },
          ],
          views: [],
        },
      }),
    });
    expect(reapplied.status).toBe(200);

    const historical = await fetch(`${baseUrl}/v1/runs/${run_id}/graph`, { headers }).then(
      (response) => response.json(),
    );
    expect(historical).toMatchObject({
      flow_digest: "sha256:graph-flow",
      mode: "history",
    });
    expect(historical.nodes.some((node: { step_id: string }) => node.step_id === "finish")).toBe(true);
    expect(historical.nodes.some((node: { step_id: string }) => node.step_id === "publish")).toBe(false);

    const current = await fetch(
      `${baseUrl}/v1/spaces/${spaceId}/flows/flw_morning_brief/preview`,
      { headers },
    ).then((response) => response.json());
    expect(current.digest).toBe("sha256:graph-flow-v2");
    expect(current.graph.nodes.some((node: { step_id: string }) => node.step_id === "publish")).toBe(true);
  });
});
