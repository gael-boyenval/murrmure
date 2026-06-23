import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/config/trigger-register", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let sandboxId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-trigger-test-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000001";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;

    const headers = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };

    await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "backend-api", name: "Backend API" }),
    });

    const sandboxRes = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "ui-sandbox", name: "UI Sandbox" }),
    });
    sandboxId = (await sandboxRes.json()).space_id;

    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("register trigger and record delivery", async () => {
    const reg = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/triggers`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "backend-ready-wake-frontend",
        filter: { event_types: ["work.ready"], source_space_id: "spc_backend_api" },
        action: { type: "wake_mcp_agent", target_space_id: sandboxId, tool: "handle_work_ready" },
        dedup: { key_jsonpath: "$.event_id", ttl_seconds: 86400 },
      }),
    });
    expect(reg.status).toBe(201);
    const tBody = await reg.json();
    expect(tBody.trigger_id).toMatch(/^trg_/);
    expect(tBody.enabled).toBe(true);

    await fetch(`${baseUrl}/v1/spaces/${sandboxId}/triggers/${tBody.trigger_id}/replay`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ source_event_id: "evt_001", reason: "test" }),
    });

    const deliveries = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/triggers/deliveries?limit=10`, {
      headers: auth(),
    });
    const dBody = await deliveries.json();
    expect(dBody.deliveries.length).toBeGreaterThanOrEqual(1);
    expect(dBody.deliveries[0].outcome).toBe("success");
  });
});
