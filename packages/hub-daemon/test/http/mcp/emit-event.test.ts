import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("mcp/murrmure_emit_event", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let emitterSpaceId: string;
  let receiverSpaceId: string;
  let emitterToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-emit-event-"));
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
                  do: [{ ensure_session: { title: "Murrmure feedback" } }],
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

  test("catalog includes murrmure_emit_event when grant has event:emit", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${emitterSpaceId}`, {
      headers: { Authorization: `Bearer ${emitterToken}` },
    });
    expect(res.status).toBe(200);
    const { tools } = (await res.json()) as { tools: Array<{ name: string }> };
    expect(tools.map((t) => t.name)).toContain("murrmure_emit_event");
  });

  test("emit infers source and repo, triggers receiver hook", async () => {
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
          payload: {
            failure_type: "test_failure",
            summary: "MCP emit smoke test",
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: Record<string, unknown> };
    expect(body.result.source).toBe(`/spaces/${emitterSpaceId}`);
    expect(body.result.repo).toBe("my-space");
    expect(body.result.event_id).toBeTruthy();

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const sessions = await fetch(`${baseUrl}/v1/sessions`, { headers: bootstrap() }).then((r) => r.json());
    const session = (sessions.sessions as Array<{ title: string }>).find(
      (s) => s.title === "Murrmure feedback",
    );
    expect(session).toBeTruthy();
  });
});
