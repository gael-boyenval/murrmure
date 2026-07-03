import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("mcp/murrmure_grant_mint", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-mcp-grant-"));
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
      body: JSON.stringify({ slug: "mcp-grant", name: "MCP Grant" }),
    });
    const body = await created.json();
    spaceId = body.space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("murrmure_grant_mint succeeds with admin scope", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "murrmure_grant_mint",
        space_id: spaceId,
        arguments: { space_id: spaceId, label: "test-agent", scopes: ["space:read"] },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.token).toBeDefined();
  });

  test("murrmure_grant_mint rejects cross-space bypass with scoped admin", async () => {
    const other = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ slug: "mcp-grant-other", name: "MCP Grant Other" }),
    });
    const otherBody = await other.json();
    const otherSpaceId = otherBody.space_id as string;

    const adminGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "scoped-admin", capabilities: ["hub:admin"] }),
    });
    const adminBody = await adminGrant.json();
    const adminToken = adminBody.token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken.startsWith("tok_") ? adminToken : addTokenId(adminToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_grant_mint",
        space_id: spaceId,
        arguments: { space_id: otherSpaceId, label: "cross-space", scopes: ["space:read"] },
      }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toContain("Token not valid");
    expect(body.result).toBeUndefined();
  });

  test("murrmure_grant_mint rejects read-only token at MCP authorization", async () => {
    const readerGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ label: "reader-only", scopes: ["space:read"] }),
    });
    const readerBody = await readerGrant.json();
    const readerToken = readerBody.token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readerToken.startsWith("tok_") ? readerToken : addTokenId(readerToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_grant_mint",
        space_id: spaceId,
        arguments: { space_id: spaceId, label: "should-fail", scopes: ["space:read"] },
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBeDefined();
    expect(body.result).toBeUndefined();
  });
});
