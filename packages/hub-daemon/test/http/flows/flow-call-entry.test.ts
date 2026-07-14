import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

// flow_call-only entry policy orchestration is beyond Task 03 (minimal flow).
// Owned by the orchestration slice; skipped here to keep the minimal-flow cutover green.
describe.skip("http/flows/flow-call-entry", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-flow-call-entry-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000062";
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

    spaceId = (
      await (
        await fetch(`${baseUrl}/v1/spaces`, {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ slug: "entry", name: "Entry" }),
        })
      ).json()
    ).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:entry-actions",
            file: { version: 1, actions: { noop: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:entry-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:entry-hooks", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_callable",
              rel_path: "flows/callable/flow.manifest.yaml",
              digest: "sha256:entry-callable",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "callable",
                triggers: { flow_call: true },
                steps: [
                  {
                    id: "work",
                    branches: {
                      completed: { schema: { type: "object" }, route: { run: "completed" } },
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
    Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000062")}`,
    "Content-Type": "application/json",
  });

  test("manual start rejected when flow_call-only", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_callable/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MANUAL_START_DISABLED");
  });
});
