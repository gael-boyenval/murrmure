import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/deprecated-removed (phase 16 + 18)", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-deprecated-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000099",
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000099")}`,
      "Content-Type": "application/json",
    });

    const spaceRes = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "deprecated-check" }),
    });
    spaceId = (await spaceRes.json()).space_id;

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ label: "agent", scopes: ["space:read", "flow:run", "action:invoke"] }),
    });
    token = (await grantRes.json()).token;
  });

  afterAll(() => cleanup?.());

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  test("POST /instances returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/instances`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ contract_ref_id: "cref_linear_demo" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /instances/{id}/transitions returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/instances/ins_demo/transitions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ event: "approve" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /mcp/wake returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/wake`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ target_space_id: spaceId, wake_label: "ping" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /flows/install returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/install`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ flow_id: "test-flow" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /evolution/validate returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/evolution/validate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ install_id: "ins_test" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /evolution/test returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/evolution/test`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ install_id: "ins_test" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /evolution/promote returns 404", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/evolution/promote`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ install_id: "ins_test" }),
    });
    expect(res.status).toBe(404);
  });

  test("MCP catalog excludes v1 platform tools", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as { tools: Array<{ name: string }> };
    const names = tools.map((t) => t.name);
    for (const removed of ["get_space_state", "transition", "wait_for_state", "emit_event", "contract_versions"]) {
      expect(names).not.toContain(removed);
    }
    expect(names).toContain("murrmure_invoke_action");
    expect(names).toContain("murrmure_emit_event");
  });

  test("MCP catalog includes murrmure_emit_event when grant has event:emit", async () => {
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000099")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: "emitter", scopes: ["space:read", "event:emit"] }),
    });
    const emitterToken = (await grantRes.json()).token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${emitterToken}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as { tools: Array<{ name: string }> };
    const names = tools.map((t) => t.name);
    expect(names).toContain("murrmure_emit_event");
    expect(names).not.toContain("emit_event");
  });

  test("MCP catalog includes murrmure_resolve_step when grant has step:resolve", async () => {
    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000099")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ label: "resolver", scopes: ["space:read", "step:resolve"] }),
    });
    const resolverToken = (await grantRes.json()).token as string;

    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${resolverToken}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as { tools: Array<{ name: string }> };
    const names = tools.map((t) => t.name);
    expect(names).toContain("murrmure_resolve_step");
  });
});
