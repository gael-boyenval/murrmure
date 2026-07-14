import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

// `triggers: {}` = invoke-only: no independent CLI/Desktop/schedule/external-event
// start. A flow with empty triggers cannot be started manually; the space-home
// eligibility surface reports `manual: false` so clients hide/disable Run.
describe("http/flows/invoke-only", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-invoke-only-"));
    const bootstrapToken = "01JBOOTSTRAPTOKEN00000072";
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
          body: JSON.stringify({ slug: "invoke-only", name: "Invoke Only" }),
        })
      ).json()
    ).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:invoke-only-actions",
            file: { version: 1, actions: { noop: { executor: "shell" } } },
          },
          executors: {
            digest: "sha256:invoke-only-exec",
            file: {
              version: 1,
              executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } },
            },
          },
          hooks: { digest: "sha256:invoke-only-hooks", file: { version: 1, hooks: {} } },
          flows: [
            {
              flow_id: "flw_invoke_only",
              rel_path: "flows/invoke-only/flow.manifest.yaml",
              digest: "sha256:invoke-only-flow",
              manifest: {
                apiVersion: "murrmure.flow/v1",
                name: "invoke-only",
                triggers: {},
                steps: [{ id: "work", description: "work" }],
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
    Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000072")}`,
    "Content-Type": "application/json",
  });

  test("manual start rejected for triggers: {} with MANUAL_START_DISABLED", async () => {
    const res = await fetch(`${baseUrl}/v1/flows/flw_invoke_only/run`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ space_id: spaceId, input: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MANUAL_START_DISABLED");
  });

  test("space-home reports triggers: {} flow with manual: false", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/home`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.your_flows.find((f: { flow_id: string }) => f.flow_id === "flw_invoke_only");
    expect(row).toBeDefined();
    expect(row.manual).toBe(false);
    // The flow is indexed and previewable even though it cannot be started manually.
    expect(row.can_preview).toBe(true);
  });
});
