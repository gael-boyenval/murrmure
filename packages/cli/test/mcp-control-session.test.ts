import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../hub-daemon/src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import {
  maxControlSeq,
  performHandshake,
  resolveMcpClientId,
} from "../src/mcp/control-session.js";

describe("mcp/control-session", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-mcp-control-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000021",
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = {
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000021")}`,
      "Content-Type": "application/json",
    };
    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap,
      body: JSON.stringify({ slug: "mcp-control", name: "MCP Control" }),
    });
    spaceId = ((await created.json()) as { space_id: string }).space_id;

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap,
      body: JSON.stringify({
        label: "mcp-control",
        scopes: ["space:read", "action:invoke"],
        flow_acl: [],
      }),
    });
    token = ((await grant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("resolveMcpClientId is stable for a space", () => {
    const first = resolveMcpClientId(spaceId);
    const second = resolveMcpClientId(spaceId);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  test("handshake registers session and replays invoke_action after hook dispatch", async () => {
    const bootstrap = {
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000021")}`,
      "Content-Type": "application/json",
    };
    const clientId = "cli-control-test";

    await fetch(`${baseUrl}/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      headers: bootstrap,
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:control-session-action",
            file: {
              version: 1,
              actions: {
                write_improvement_feedback: {
                  executor: "cursor-mcp",
                  delivery: "queue_until_executor",
                },
              },
            },
          },
          executors: {
            digest: "sha256:control-session-exec",
            file: {
              executors: {
                "cursor-mcp": {
                  binding: { type: "mcp_session", executor_id: "cursor-mcp" },
                },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    const hs1 = await performHandshake({
      hubUrl: baseUrl,
      spaceId,
      token,
      clientId,
      lastAckSeq: 0,
    });
    expect(hs1.handshake_ack_seq).toBeGreaterThan(0);

    const invoke = await fetch(`${baseUrl}/v1/spaces/${spaceId}/actions/write_improvement_feedback/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        params: {
          topic: "MCP handshake",
          summary: "Verify control bus delivery",
        },
      }),
    });
    expect(invoke.status).toBe(200);
    const invokeBody = (await invoke.json()) as { dispatch?: { status?: string } };
    expect(invokeBody.dispatch?.status).toBe("dispatched");

    const lastAckAfterFirst = Math.max(hs1.handshake_ack_seq, maxControlSeq(hs1.messages));
    const hs2 = await performHandshake({
      hubUrl: baseUrl,
      spaceId,
      token,
      clientId,
      lastAckSeq: lastAckAfterFirst,
    });

    const wake = hs2.messages.find(
      (message) => message.method === "murrmure/control.invoke_action",
    );
    expect(wake?.params.action_name).toBe("write_improvement_feedback");
    expect(wake?.params.params).toMatchObject({
      topic: "MCP handshake",
      summary: "Verify control bus delivery",
    });
  });
});
