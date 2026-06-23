import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("feature-spec/spec-summary-query", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let specsSpaceId: string;
  let devSpaceId: string;
  let devToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-summary-"));
    const dataDir = join(dir, "data");
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir,
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

    const specsSpace = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "product-specs", install_policy: "authorized_agents" }),
    });
    specsSpaceId = (await specsSpace.json()).space_id;

    const devSpace = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "dev-code", install_policy: "authorized_agents" }),
    });
    devSpaceId = (await devSpace.json()).space_id;

    await fetch(`${baseUrl}/v1/spaces/${specsSpaceId}`, {
      method: "PATCH",
      headers: bootstrap(),
      body: JSON.stringify({
        query_policy: { inbound_allowlist: [devSpaceId] },
      }),
    });

    await installExampleCapability({
      baseUrl,
      spaceId: specsSpaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      config: { skip_review: true },
    });

    const agentGrant = await fetch(`${baseUrl}/v1/spaces/${specsSpaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "spec-agent",
        scopes: ["space:read", "state:transition", "event:emit", "blob:write"],
        capability_acl: ["feature-spec"],
      }),
    });
    const agentToken = (await agentGrant.json()).token;

    const open = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${specsSpaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "open_spec", arguments: { title: "Cross-space summary" } }),
    });
    const specKey = (await open.json()).result.spec_key;
    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${specsSpaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "patch_spec_section",
        arguments: { spec_key: specKey, section_id: "overview", title: "Overview", body: "Summary body.", order: 1 },
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

    const devGrant = await fetch(`${baseUrl}/v1/spaces/${devSpaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "dev-agent",
        scopes: ["space:read"],
        capability_acl: [],
      }),
    });
    devToken = (await devGrant.json()).token;
  });

  afterAll(() => cleanup?.());

  test("spec_summary@1 returns summary without body_ref", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${devSpaceId}/queries/ask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${devToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        target_space_id: specsSpaceId,
        query_type: "spec_summary@1",
        params: {},
      }),
    });
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.data).toMatchObject({
      title: "Cross-space summary",
      version: 1,
    });
    expect(body.data.summary).toBeDefined();
    expect(body.data.body_ref).toBeUndefined();
    expect(body._attribution.source_space_id).toBe(specsSpaceId);
  });
});
