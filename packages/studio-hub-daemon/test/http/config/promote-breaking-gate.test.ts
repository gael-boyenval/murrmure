import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";

describe("http/config/promote-breaking-gate", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let sandboxId: string;
  let installId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-promote-test-"));
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

    const spaceRes = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "ui-sandbox", name: "UI Sandbox", install_policy: "authorized_agents" }),
    });
    const spaceBody = await spaceRes.json();
    sandboxId = spaceBody.space_id;

    await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "ui-production", name: "UI Production", install_policy: "human_only" }),
    });

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

  test("breaking promote triggers promoted_pending gate", async () => {
    const install = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/capabilities/install`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        package_id: "review-loop",
        version: "3.0.0",
        config: { production_gate_enabled: true },
        target_state: "draft",
      }),
    });
    const iBody = await install.json();
    installId = iBody.install_id;
    expect(iBody.evolution_state).toBe("draft");

    await fetch(`${baseUrl}/v1/spaces/${sandboxId}/evolution/validate`, { method: "POST", headers: auth(), body: "{}" });
    await fetch(`${baseUrl}/v1/spaces/${sandboxId}/evolution/test`, { method: "POST", headers: auth(), body: "{}" });

    const promote = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/evolution/promote`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ target_space_id: "spc_ui_production", install_id: installId }),
    });
    const pBody = await promote.json();
    expect(pBody.evolution_state).toBe("promoted_pending");
    expect(pBody.gate_id).toMatch(/^chk_/);

    const diff = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/contracts/diff?from=2.0.0&to=3.0.0`, {
      headers: auth(),
    });
    const dBody = await diff.json();
    expect(dBody.states_added.length).toBeGreaterThanOrEqual(1);
  });
});
