import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

// The mcp_wake trigger-action wire is retired (Task 15 Lane C): the
// POST /v1/mcp/wake wire is 404 and mcpWake(...) is not a runtime primitive.
// Registration of mcp_wake trigger templates and custom mcp_wake actions is
// rejected at the register/apply boundary (strict, not silent). New spaces
// declare event reactions with on: event: handlers in .mrmr/space/handlers.yaml
// + murrmure_emit_event. The dedup/delivery path for mcp_wake is gone with the
// wire; handler delivery dedup is covered by the hook-dispatch tests.
describe("triggers/mcp-wake-rejected", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let backendId: string;
  let frontendId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-mcp-wake-rej-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    backendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "backend-api", name: "Backend" }),
      })
    ).json()).space_id;

    frontendId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "ui-sandbox", name: "UI Sandbox" }),
      })
    ).json()).space_id;
  });

  afterAll(() => cleanup?.());

  function bootstrap() {
    return {
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    };
  }

  test("retired work-ready-wake-frontend template registration is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers/from-template`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        template_id: "work-ready-wake-frontend",
        source_space_id: backendId,
        target_space_id: frontendId,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_ACTION_RETIRED");
    expect(body.message).toContain("mcp_wake");
  });

  test("retired spec-published-wake-dev template registration is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers/from-template`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        template_id: "spec-published-wake-dev",
        source_space_id: backendId,
        target_space_id: frontendId,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_ACTION_RETIRED");
  });

  test("custom mcp_wake action registration is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        name: "backend-ready-wake-frontend",
        filter: {
          event_types: ["work.ready"],
          source_space_id: backendId,
          payload_match: { type: "api_change" },
        },
        action: {
          type: "mcp_wake",
          target_space_id: frontendId,
          wake_label: "handle_work_ready",
          payload_map: { type: "$.payload.type" },
        },
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_ACTION_RETIRED");
  });

  test("legacy wake_mcp_agent alias registration is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        name: "legacy-alias",
        filter: { event_types: ["work.ready"], source_space_id: backendId },
        action: { type: "wake_mcp_agent", target_space_id: frontendId, wake_label: "handle_work_ready" },
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_ACTION_RETIRED");
  });

  test("legacy tool shorthand registration is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${frontendId}/triggers`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        name: "legacy-tool",
        filter: { event_types: ["work.ready"], source_space_id: backendId },
        action: { tool: "handle_work_ready", target_space_id: frontendId },
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("TRIGGER_ACTION_RETIRED");
  });
});
