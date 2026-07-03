import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/flows/flow-call-happy", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "flow-call-happy-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const echoScript = join(binDir, "echo.sh");
    writeFileSync(echoScript, '#!/bin/sh\necho \'{"ok":true}\'\n');
    chmodSync(echoScript, 0o755);

    const dir = mkdtempSync(join(tmpdir(), "hub-flow-call-happy-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000060";
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
          body: JSON.stringify({ slug: "orch", name: "Orch" }),
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
            digest: "sha256:fc-actions",
            file: {
              version: 1,
              actions: {
                ping: { executor: "shell", command: "./bin/echo.sh" },
              },
            },
          },
          executors: {
            digest: "sha256:fc-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:fc-hooks", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_review_url",
              rel_path: "flows/review-url/flow.manifest.yaml",
              digest: "sha256:fc-review",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "review-url",
                start: { manual: false, flow_call: true },
                steps: [
                  { id: "review", invoke: { space: "{{origin_space}}", action: "ping" } },
                ],
              },
            },
            {
              flow_id: "flw_orchestrator",
              rel_path: "flows/orchestrator/flow.manifest.yaml",
              digest: "sha256:fc-orch",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "orchestrator",
                start: { manual: true },
                steps: [
                  { id: "dev", invoke: { space: "{{origin_space}}", action: "ping" } },
                  {
                    id: "review",
                    start_flow: {
                      flow_id: "flw_review_url",
                      input: { url: "{{steps.dev.output.preview_url}}" },
                      wait: true,
                    },
                  },
                ],
              },
            },
          ],
          views: [],
        },
      }),
    });
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("parent run waits for child and session has both runs", async () => {
    const started = await fetch(`${baseUrl}/v1/flows/flw_orchestrator/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(started.status).toBe(201);
    const { run_id, session } = (await started.json()) as {
      run_id: string;
      session: { session_id: string };
    };

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const runRes = await fetch(`${baseUrl}/v1/runs/${run_id}`, { headers: auth() });
      const run = (await runRes.json()) as { lifecycle: string };
      if (run.lifecycle === "completed" || run.lifecycle === "failed") break;
    }

    const parent = (await (
      await fetch(`${baseUrl}/v1/runs/${run_id}`, { headers: auth() })
    ).json()) as { lifecycle: string };
    expect(parent.lifecycle).toBe("completed");

    const sessionRuns = (await (
      await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, { headers: auth() })
    ).json()) as { runs: Array<{ run_id: string; flow_id?: string | null }> };
    expect(sessionRuns.runs.length).toBeGreaterThanOrEqual(2);
    expect(sessionRuns.runs.some((r) => r.flow_id === "flw_review_url")).toBe(true);

    const graph = await (
      await fetch(`${baseUrl}/v1/runs/${run_id}/graph`, { headers: auth() })
    ).json();
    expect(graph.nodes.some((n: { kind: string }) => n.kind === "child_run")).toBe(true);
  });
});
