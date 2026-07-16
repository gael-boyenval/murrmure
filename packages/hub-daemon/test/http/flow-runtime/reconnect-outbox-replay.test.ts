import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { addTokenId } from "@murrmure/hub-core";
import { applySpaceBundle, bootstrapAuth, createSpace, startHubTestFixtureAsync } from "../../helpers/space-fixture.js";

describe("flow-runtime/mcp-wake", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sandboxId: string;
  let token: string;

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({ prefix: "cr-mcp-wake-" });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;

    sandboxId = await createSpace(baseUrl, fixture.bootstrapToken, {
      slug: "ui-sandbox-wake",
      install_policy: "authorized_agents",
    });

    await applySpaceBundle(baseUrl, fixture.bootstrapToken, sandboxId, {
      actions: {
        digest: "sha256:wake-legacy",
        file: {
          version: 1,
          actions: {
            handle_spec_published: { executor: "cursor-mcp" },
          },
        },
      },
      executors: {
        digest: "sha256:wake-exec-legacy",
        file: {
          executors: {
            "cursor-mcp": {
              binding: { type: "mcp_session", executor_id: "cursor-mcp" },
            },
          },
        },
      },
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(fixture.bootstrapToken),
      body: JSON.stringify({ label: "dev", scopes: ["space:enter", "space:read"] }),
    });
    token = (await grant.json()).token;

    await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: sandboxId, client_id: "wake-client", last_ack_seq: 0 }),
    });
  });

  afterAll(() => cleanup?.());

  test("removed murrmure_invoke_action is rejected", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "murrmure_invoke_action",
        space_id: sandboxId,
        arguments: {
          action_name: "handle_spec_published",
          params: { spec_key: "ins_test" },
        },
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.result).toBeUndefined();
  });
});
