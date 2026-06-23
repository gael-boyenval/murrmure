import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("triggers/spec-published-wake-dev", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let specsSpaceId: string;
  let devSpaceId: string;
  let agentToken: string;
  let devToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-spec-wake-"));
    const dataDir = join(dir, "data");
    process.env.STUDIO_SPACE_ID = "";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
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

    specsSpaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "product-specs", install_policy: "authorized_agents" }),
      })
    ).json()).space_id;

    devSpaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "dev-code", install_policy: "authorized_agents" }),
      })
    ).json()).space_id;

    process.env.STUDIO_SPACE_ID = specsSpaceId.replace(/^spc_/, "");

    await installExampleCapability({
      baseUrl,
      spaceId: specsSpaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      config: { skip_review: true },
    });

    agentToken = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${specsSpaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "spec-agent",
            scopes: ["space:read", "state:transition", "event:emit", "blob:write"],
            capability_acl: ["feature-spec"],
          }),
        })
      ).json()
    ).token;

    devToken = (
      await (
        await fetch(`${baseUrl}/v1/spaces/${devSpaceId}/grants`, {
          method: "POST",
          headers: bootstrap(),
          body: JSON.stringify({
            label: "dev-agent",
            scopes: ["space:read"],
            capability_acl: [],
          }),
        })
      ).json()
    ).token;
  });

  afterAll(() => cleanup?.());

  test("register from template + publish wakes dev agent", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const reg = await fetch(`${baseUrl}/v1/spaces/${devSpaceId}/triggers/from-template`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        template_id: "spec-published-wake-dev",
        source_space_id: specsSpaceId,
        target_space_id: devSpaceId,
      }),
    });
    expect(reg.status).toBe(201);
    expect((await reg.json()).trigger_id).toMatch(/^trg_/);

    await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: devSpaceId, client_id: "dev-cursor", last_ack_seq: 0 }),
    });

    const open = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${specsSpaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "open_spec", arguments: { title: "Trigger wake test" } }),
    });
    const specKey = (await open.json()).result.spec_key;

    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${specsSpaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "patch_spec_section",
        arguments: { spec_key: specKey, section_id: "s1", title: "S", body: "Body", order: 1 },
      }),
    });
    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${specsSpaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "transition_spec",
        arguments: { spec_key: specKey, event: "context_ready" },
      }),
    });
    await fetch(`${baseUrl}/api/feature-spec/specs/${specKey}/publish`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ event: "publish_direct" }),
    });

    const hs = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: devSpaceId, client_id: "dev-cursor", last_ack_seq: 1 }),
    });
    const hsBody = await hs.json();
    const wake = hsBody.messages?.find(
      (m: { method: string }) => m.method === "studio/control.wake_pending",
    );
    expect(wake?.params?.wake_label).toBe("handle_spec_published");
    expect(wake?.params?.payload?.spec_key).toBe(specKey);
    expect(wake?.params?.payload?.body_ref).toBeUndefined();

    const deliveries = await fetch(`${baseUrl}/v1/spaces/${devSpaceId}/triggers/deliveries?limit=10`, {
      headers: bootstrap(),
    });
    const dBody = await deliveries.json();
    expect(dBody.deliveries.filter((d: { outcome: string }) => d.outcome === "success").length).toBe(1);
  });
});
