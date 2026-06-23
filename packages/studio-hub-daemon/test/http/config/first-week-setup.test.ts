import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/config/first-week-setup", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let sandboxId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-config-test-"));
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

  test("GET /v1/health", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  test("GET /v1/auth/whoami", async () => {
    const res = await fetch(`${baseUrl}/v1/auth/whoami`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actor_id).toBeDefined();
    expect(body.spaces).toBeDefined();
  });

  test("create spaces", async () => {
    const sandbox = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        slug: "ui-sandbox",
        name: "UI Sandbox",
        install_policy: "authorized_agents",
        preview_policy: "same_origin_only",
      }),
    });
    expect(sandbox.status).toBe(200);
    const sBody = await sandbox.json();
    sandboxId = sBody.space_id;
    expect(sandboxId).toMatch(/^spc_/);

    const prod = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        slug: "ui-production",
        name: "UI Production",
        install_policy: "human_only",
      }),
    });
    expect(prod.status).toBe(200);
  });

  test("install review-loop to sandbox", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/flows/install`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        flow_id: "review-loop",
        version: "2.0.0",
        config: { production_gate_enabled: true, required_approver_role: "product_lead" },
        target_state: "live",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evolution_state).toBe("live");
    expect(body.contract_ref_id).toBe("cref_review_loop");
  });

  test("validate and test evolution", async () => {
    const validate = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/evolution/validate`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({}),
    });
    const vBody = await validate.json();
    expect(vBody.lens_a_pass).toBe(true);

    const testRes = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/evolution/test`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({}),
    });
    const tBody = await testRes.json();
    expect(tBody.passed).toBe(true);
  });

  test("mint worker grant", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        label: "Dev Cursor — ui-sandbox worker",
        harness: "cursor-local",
        template: "worker",
        capability_acl: ["review-loop"],
        expires_in_days: 90,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^tok_/);
    expect(body.scopes).toContain("state:transition");
    expect(body.scopes).toContain("event:emit");
  });

  test("verify space readable", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sandboxId}`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.install_policy).toBe("authorized_agents");
  });
});
