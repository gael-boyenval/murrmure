import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/actions/invoke-shell", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "invoke-shell-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "echo.sh");
    writeFileSync(script, '#!/bin/sh\necho \'{"task":"done"}\'\n');
    chmodSync(script, 0o755);

    const dir = mkdtempSync(join(tmpdir(), "hub-invoke-shell-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000003";
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
      body: JSON.stringify({ slug: "invoke-shell", name: "Invoke Shell" }),
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
            digest: "sha256:actions1",
            file: {
              version: 1,
              actions: {
                daily_checkin: {
                  executor: "shell",
                  command: "./bin/echo.sh",
                },
              },
            },
          },
          executors: {
            digest: "sha256:exec1",
            file: {
              executors: {
                shell: {
                  binding: { type: "shell_spawn", executor_id: "shell" },
                },
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

  test("shell invoke completes synchronously", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/daily_checkin/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ params: { task: "test" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatch.status).toBe("completed");
    expect(body.body).toEqual({ task: "done" });
    expect(body.dispatch.step_id).toBe("action:daily_checkin");
  });
});
