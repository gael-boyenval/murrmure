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
      databasePath: join(dir, "murrmure.db"),
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

  test("register rejects retired mcp_wake / legacy alias actions (strict)", async () => {
    // Legacy wake_mcp_agent + tool shorthand alias — gone with the retired wire.
    const regAlias = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/triggers`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "backend-ready-wake-frontend",
        filter: { event_types: ["work.ready"], source_space_id: "spc_backend_api" },
        action: { type: "wake_mcp_agent", target_space_id: sandboxId, tool: "handle_work_ready" },
        dedup: { key_jsonpath: "$.event_id", ttl_seconds: 86400 },
      }),
    });
    expect(regAlias.status).toBe(422);
    const aliasBody = await regAlias.json();
    expect(aliasBody.code).toBe("TRIGGER_ACTION_RETIRED");

    // Explicit mcp_wake action — rejected at the register/apply boundary.
    const regWake = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/triggers`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "explicit-wake",
        filter: { event_types: ["work.ready"], source_space_id: "spc_backend_api" },
        action: { type: "mcp_wake", target_space_id: sandboxId, wake_label: "handle_work_ready" },
      }),
    });
    expect(regWake.status).toBe(422);
    const wakeBody = await regWake.json();
    expect(wakeBody.code).toBe("TRIGGER_ACTION_RETIRED");
  });
});
