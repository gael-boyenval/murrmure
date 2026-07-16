import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/actions/invoke-unavailable", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-invoke-unavail-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000004";
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
      body: JSON.stringify({ slug: "invoke-mcp", name: "Invoke MCP" }),
    });
    spaceId = (await created.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:actions-mcp",
            file: {
              version: 1,
              actions: {
                review_url: {
                  executor: "cursor-mcp",
                  delivery: "fail_fast",
                },
              },
            },
          },
          executors: {
            digest: "sha256:exec-mcp",
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
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("action invoke route is removed (404)", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/review_url/invoke`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ params: { url: "https://example.com" } }),
    });
    expect(res.status).toBe(404);
  });
});
