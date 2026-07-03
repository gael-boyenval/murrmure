import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/actions/invoke-run-failed-notification", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "invoke-fail-notif-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const failScript = join(binDir, "fail.sh");
    writeFileSync(failScript, '#!/bin/sh\necho \'{"error":"boom"}\' >&2\nexit 1\n');
    chmodSync(failScript, 0o755);

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
      rmSync(projectDir, { recursive: true, force: true });
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
            digest: "sha256:fail-actions",
            file: {
              version: 1,
              actions: {
                always_fail: { executor: "shell", command: "./bin/fail.sh" },
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

  test("failed invoke marks run failed and creates run_failed notification", async () => {
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
    expect(invokeRes.status).toBe(422);

    const runCheck = await fetch(`${baseUrl}/v1/runs/${run.run_id}`, { headers: auth() });
    const runBody = await runCheck.json();
    expect(runBody.lifecycle).toBe("failed");

    const notifications = await fetch(`${baseUrl}/v1/notifications?status=pending`, { headers: auth() });
    const notifBody = (await notifications.json()) as {
      notifications: Array<{ kind: string; run_id?: string }>;
    };
    expect(notifBody.notifications.some((n) => n.kind === "run_failed" && n.run_id === run.run_id)).toBe(true);
  });
});
