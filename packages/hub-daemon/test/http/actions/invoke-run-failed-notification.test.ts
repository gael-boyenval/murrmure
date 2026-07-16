import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/actions/invoke-run-failed-notification", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-invoke-fail-notif-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000055";
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
      body: JSON.stringify({ slug: "invoke-fail-notif", name: "Invoke Fail Notif" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:fail-actions",
            file: {
              version: 1,
              actions: {
                always_fail: { executor: "shell", command: "./bin/fail.sh" },
                slow_hang: { executor: "shell", command: "./bin/hang.sh" },
              },
            },
          },
          executors: {
            digest: "sha256:fail-exec",
            file: {
              executors: {
                shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
              },
            },
          },
          flows: [],
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

  test("action invoke route is removed — failing action not reachable (404)", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ title: "Fail session", space_id: spaceId }),
    });
    const session = (await sessionRes.json()) as { session_id: string };

    const runRes = await fetch(`${baseUrl}/v1/sessions/${session.session_id}/runs`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ flow_id: null, space_id: spaceId }),
    });
    const { run } = (await runRes.json()) as { run: { run_id: string } };

    const invokeRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/always_fail/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        session_id: session.session_id,
        run_id: run.run_id,
        step_id: "action:always_fail",
        params: {},
      }),
    });
    expect(invokeRes.status).toBe(404);
  });

  test("action invoke route is removed — hanging action not reachable (404)", async () => {
    const invokeRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/slow_hang/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ params: {} }),
    });
    expect(invokeRes.status).toBe(404);
  });
});
