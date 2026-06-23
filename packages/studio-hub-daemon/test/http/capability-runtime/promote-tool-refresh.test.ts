import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("capability-runtime/promote-tool-refresh", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sandboxId: string;
  let token: string;
  let dataDir: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-promote-tool-"));
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
      body: JSON.stringify({ slug: "ui-sandbox-cr", name: "Sandbox", install_policy: "authorized_agents" }),
    });
    sandboxId = (await sandbox.json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId: sandboxId,
      bootstrapHeaders: bootstrap,
      exampleId: "review-loop",
      hubDataDir: dataDir,
    });

    await installExampleCapability({
      baseUrl,
      spaceId: sandboxId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      version: "1.0.0",
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "dev-worker",
        scopes: ["space:read", "state:transition", "flow:install"],
        capability_acl: ["review-loop", "feature-spec"],
      }),
    });
    token = (await grant.json()).token;
  });

  afterAll(() => cleanup?.());

  test("handshake ack includes platform tools", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: sandboxId, client_id: "cursor-local-uuid", last_ack_seq: 0 }),
    });
    const body = await res.json();
    expect(body.handshake_ack_seq).toBe(1);
    expect(body.server_tools).toContain("create_review_session");
  });

  test("live apply 1.0.0 → 1.1.0 pushes tools_changed", async () => {
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

    await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: sandboxId, client_id: "cursor-local-uuid", last_ack_seq: 0 }),
    });

    const apply = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/flows/${bumpBody.install_id}/apply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`, "Content-Type": "application/json" },
    });
    expect(apply.status).toBe(200);

    const handshake = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: sandboxId, client_id: "cursor-local-uuid", last_ack_seq: 1 }),
    });
    const hsBody = await handshake.json();
    const toolsChanged = hsBody.messages.find(
      (m: { method: string }) => m.method === "studio/control.tools_changed",
    );
    expect(toolsChanged?.params.added).toEqual(expect.arrayContaining(["add_context_ref", "transition_spec"]));

    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${sandboxId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const names = ((await catalog.json()).tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["add_context_ref", "transition_spec"]));
  });
});
