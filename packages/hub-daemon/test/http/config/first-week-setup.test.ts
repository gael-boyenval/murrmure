import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/config/first-week-setup", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let sandboxId: string;

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({ prefix: "hub-config-test-" });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;
  });

  afterAll(() => cleanup?.());

  test("GET /v1/health", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  test("GET /v1/auth/whoami", async () => {
    const res = await fetch(`${baseUrl}/v1/auth/whoami`, { headers: bootstrapAuth(bootstrapToken) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actor_id).toBeDefined();
    expect(body.spaces).toBeDefined();
  });

  test("create spaces", async () => {
    sandboxId = await createSpace(baseUrl, bootstrapToken, {
      slug: "ui-sandbox",
      name: "UI Sandbox",
      install_policy: "authorized_agents",
      preview_policy: "same_origin_only",
    });
    expect(sandboxId).toMatch(/^spc_/);

    const prod = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        slug: "ui-production",
        name: "UI Production",
        install_policy: "human_only",
      }),
    });
    expect(prod.status).toBe(200);
  });

  test("apply indexed actions to sandbox", async () => {
    const res = await applySpaceBundle(baseUrl, bootstrapToken, sandboxId, {
      actions: {
        digest: "sha256:first-week",
        file: {
          version: 1,
          actions: { hello: { executor: "shell" } },
        },
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary?.actions).toBe(1);
  });

  test("mint worker grant", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "Dev Cursor — ui-sandbox worker",
        harness: "cursor-local",
        template: "worker",
        flow_acl: ["preview-review"],
        expires_in_days: 90,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toMatch(/^tok_/);
    expect(body.capabilities).toContain("flow:run");
    expect(body.capabilities).toContain("action:invoke");
  });

  test("verify space readable", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${sandboxId}`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.install_policy).toBe("authorized_agents");
  });
});
