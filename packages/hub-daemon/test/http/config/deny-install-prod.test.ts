import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/config/deny-install-prod", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let agentToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-deny-test-"));
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
      body: JSON.stringify({
        slug: "ui-production",
        name: "UI Production",
        install_policy: "human_only",
      }),
    });

    const grantRes = await fetch(`${baseUrl}/v1/spaces/spc_ui_production/grants`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        label: "Builder agent",
        harness: "cursor-local",
        template: "worker",
        scopes: ["flow:install"],
      }),
    });
    const grantBody = await grantRes.json();
    agentToken = grantBody.token;

    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };
  });

  afterAll(() => cleanup?.());

  test("agent install HTTP route removed (policy via internal install)", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/spc_ui_production/flows/install`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        flow_id: "brand-check",
        version: "1.0.0",
        target_state: "live",
      }),
    });
    expect(res.status).toBe(404);
  });
});
