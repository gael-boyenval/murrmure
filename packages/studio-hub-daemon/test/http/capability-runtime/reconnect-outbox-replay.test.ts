import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("capability-runtime/reconnect-outbox-replay", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sandboxId: string;
  let token: string;
  let dataDir: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-reconnect-"));
    dataDir = join(dir, "data");
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.ctx.workerPool.killAll();
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const sandbox = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "ui-sandbox-replay", install_policy: "authorized_agents" }),
    });
    sandboxId = (await sandbox.json()).space_id;

    const grant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "dev-worker",
        scopes: ["space:read", "state:transition", "capability:install"],
        capability_acl: ["review-loop", "feature-spec"],
      }),
    });
    token = (await grant.json()).token;

    await installExampleCapability({
      baseUrl,
      spaceId: sandboxId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      version: "1.0.0",
    });
  });

  afterAll(() => cleanup?.());

  test("reconnect replays missed control messages by seq", async () => {
    const hs1 = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: sandboxId, client_id: "cursor-local-uuid-1", last_ack_seq: 0 }),
    });
    const body1 = await hs1.json();
    expect(body1.handshake_ack_seq).toBe(1);

    const bump = await installExampleCapability({
      baseUrl,
      spaceId: sandboxId,
      bootstrapHeaders: () => ({
        Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
        "Content-Type": "application/json",
      }),
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      version: "1.1.0",
      apply: false,
    });
    const bumpBody = { install_id: bump.install_id };
    await fetch(`${baseUrl}/v1/spaces/${sandboxId}/capabilities/${bumpBody.install_id}/apply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`, "Content-Type": "application/json" },
    });

    const hs2 = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: sandboxId, client_id: "cursor-local-uuid-1", last_ack_seq: 1 }),
    });
    const body2 = await hs2.json();
    const replay = body2.messages.filter((m: { params: { seq: number } }) => m.params.seq >= 2);
    expect(replay.some((m: { method: string }) => m.method === "studio/control.tools_changed")).toBe(true);
  });
});

describe("capability-runtime/mcp-wake", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sandboxId: string;
  let token: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-mcp-wake-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const sandbox = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "ui-sandbox-wake", install_policy: "authorized_agents" }),
    });
    sandboxId = (await sandbox.json()).space_id;

    const grant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrap(),
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

  test("mcp_wake succeeds without wake_label in catalog", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/wake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        target_space_id: sandboxId,
        wake_label: "handle_spec_published",
        payload: { spec_key: "ins_test" },
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
