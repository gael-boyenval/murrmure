import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/actions/invoke-journal", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;
  let projectDir: string;

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "invoke-journal-"));
    const binDir = join(projectDir, "bin");
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "echo.sh");
    writeFileSync(script, '#!/bin/sh\necho \'{"task":"done"}\'\n');
    chmodSync(script, 0o755);

    const dir = mkdtempSync(join(tmpdir(), "hub-invoke-journal-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000007";
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
      body: JSON.stringify({ slug: "invoke-journal", name: "Invoke Journal" }),
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
            digest: "sha256:actions-journal",
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
            digest: "sha256:exec-journal",
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

  test("action invoke route is removed (404)", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/daily_checkin/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ params: { task: "test" } }),
    });
    expect(res.status).toBe(404);
  });

  test("action invoke route is removed for unavailable executors too (404)", async () => {
    const unavailSpace = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "invoke-journal-mcp", name: "Invoke Journal MCP" }),
    });
    const unavailSpaceId = (await unavailSpace.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${unavailSpaceId}/apply`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:actions-mcp-j",
            file: {
              version: 1,
              actions: {
                review_url: { executor: "cursor-mcp", delivery: "fail_fast" },
              },
            },
          },
          executors: {
            digest: "sha256:exec-mcp-j",
            file: {
              executors: {
                "cursor-mcp": {
                  binding: { type: "mcp_session", executor_id: "cursor-mcp" },
                },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    const invokeRes = await fetch(`${baseUrl}/v1/spaces/${unavailSpaceId}/actions/review_url/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ params: { url: "https://example.com" } }),
    });
    expect(invokeRes.status).toBe(404);
  });
});
