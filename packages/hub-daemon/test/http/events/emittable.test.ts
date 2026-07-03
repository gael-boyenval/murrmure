import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("events/emittable", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let emitterSpaceId: string;
  let receiverSpaceId: string;
  let emitterToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "events-emittable-"));
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

    emitterSpaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "my-space", name: "My Space" }),
      })
    ).json()).space_id;

    receiverSpaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "murrmure", name: "Murrmure" }),
      })
    ).json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${receiverSpaceId}/apply`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        bundle: {
          hooks: {
            digest: "sha256:hooks-feedback",
            file: {
              version: 1,
              hooks: {
                "on-dev-failure": {
                  on: {
                    event: {
                      type: "murrmure.feedback.failure",
                      source: [`/spaces/${emitterSpaceId}`],
                    },
                  },
                  do: [
                    {
                      invoke: {
                        action: "write_failure_feedback",
                        params: { summary: "{{event.data.summary}}" },
                      },
                    },
                  ],
                },
              },
            },
          },
          events: {
            digest: "sha256:events-feedback",
            file: {
              version: 1,
              events: {
                "murrmure.feedback.failure": {
                  description: "Failure feedback",
                  payload: { required: ["summary"] },
                },
              },
            },
          },
        },
      }),
    });

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${emitterSpaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "emitter",
        scopes: ["space:read", "event:emit"],
      }),
    });
    emitterToken = (await grantRes.json()).token;
  });

  afterAll(() => cleanup?.());

  test("GET /events/emittable lists events for caller space", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${emitterSpaceId}/events/emittable`, {
      headers: { Authorization: `Bearer ${emitterToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ event_type: string; description?: string }> };
    expect(body.events.map((e) => e.event_type)).toContain("murrmure.feedback.failure");
    expect(body.events.find((e) => e.event_type === "murrmure.feedback.failure")?.description).toBe(
      "Failure feedback",
    );
  });

  test("MCP catalog includes murrmure_list_emittable_events and emit inputSchema", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${emitterSpaceId}`, {
      headers: { Authorization: `Bearer ${emitterToken}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as {
      tools: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    };
    expect(tools.map((t) => t.name)).toContain("murrmure_list_emittable_events");
    const emitTool = tools.find((t) => t.name === "murrmure_emit_event");
    expect(emitTool?.inputSchema).toBeTruthy();
  });

  test("murrmure_list_emittable_events MCP tool", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${emitterSpaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "murrmure_list_emittable_events", arguments: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { events: Array<{ event_type: string }> } };
    expect(body.result.events.map((e) => e.event_type)).toContain("murrmure.feedback.failure");
  });

  test("murrmure_emit_event validates required payload fields", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${emitterSpaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_emit_event",
        arguments: {
          event_type: "murrmure.feedback.failure",
          payload: { failure_type: "test" },
        },
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("summary");
  });
});
