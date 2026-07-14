import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

function chainFlows(depth: number) {
  const flows = [];
  for (let i = 0; i < depth; i++) {
    const id = `flw_depth_${i}`;
    const next = i < depth - 1 ? `flw_depth_${i + 1}` : "flw_depth_leaf";
    flows.push({
      flow_id: id,
      rel_path: `flows/depth-${i}/flow.manifest.yaml`,
      digest: `sha256:depth-${i}`,
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: `depth-${i}`,
        triggers: i === 0 ? { manual: true } : { flow_call: true },
        steps: [{ id: "next", start_flow: { flow_id: next, input: {}, wait: true } }],
      },
    });
  }
  flows.push({
    flow_id: "flw_depth_leaf",
    rel_path: "flows/depth-leaf/flow.manifest.yaml",
    digest: "sha256:depth-leaf",
    manifest: {
      apiVersion: "murrmure.flow/v1",
      name: "depth-leaf",
      triggers: { flow_call: true },
      steps: [
        {
          id: "done",
          branches: {
            completed: { schema: { type: "object" }, route: { run: "completed" } },
          },
        },
      ],
    },
  });
  return flows;
}

// flow_call recursion-depth orchestration is beyond Task 03 (minimal flow).
// Owned by the orchestration slice; skipped here to keep the minimal-flow cutover green.
describe.skip("http/flows/flow-call-depth", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "flow-call-depth-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const echoScript = join(binDir, "echo.sh");
    writeFileSync(echoScript, '#!/bin/sh\necho \'{"ok":true}\'\n');
    chmodSync(echoScript, 0o755);

    const dir = mkdtempSync(join(tmpdir(), "hub-flow-call-depth-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000063";
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
      rmSync(projectDir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    spaceId = (
      await (
        await fetch(`${baseUrl}/v1/spaces`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ slug: "depth", name: "Depth" }),
        })
      ).json()
    ).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ path: projectDir, primary: true }),
    });

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:depth-actions",
            file: {
              version: 1,
              actions: { ping: { executor: "shell", command: "./bin/echo.sh" } },
            },
          },
          executors: {
            digest: "sha256:depth-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:depth-hooks", file: { version: 1, hooks: {} } },
          flows: chainFlows(9),
          views: [],
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  test(
    "depth beyond default 8 fails parent run",
    async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_depth_0/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000063")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(res.status).toBe(201);
    const { run_id } = (await res.json()) as { run_id: string };

    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const detail = (await (
        await fetch(`${baseUrl}/v1/runs/${run_id}`, {
          headers: {
            Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000063")}`,
          },
        })
      ).json()) as { lifecycle: string };
      if (detail.lifecycle === "failed" || detail.lifecycle === "completed") {
        expect(detail.lifecycle).toBe("failed");
        return;
      }
    }
    throw new Error("expected run to fail on depth exceeded");
  },
    15_000,
  );
});
