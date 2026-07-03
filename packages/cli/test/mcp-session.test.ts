import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../hub-daemon/src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("mcp/murrmure_create_session", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-session-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000011";
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
      body: JSON.stringify({ slug: "mcp-session", name: "MCP Session" }),
    });
    spaceId = ((await created.json()) as { space_id: string }).space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("murrmure_create_session round-trip via MCP tools/call", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "murrmure_create_session",
        space_id: spaceId,
        arguments: { title: "MCP round-trip", space_id: spaceId, subject: "demo" },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { session_id: string; title: string } };
    const session = body.result;
    expect(session.session_id).toMatch(/^ses_/);
    expect(session.title).toBe("MCP round-trip");
  });
});
