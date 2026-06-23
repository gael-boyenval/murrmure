import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("feature-spec/revise-republish-v2", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;
  let specKey: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-revise-"));
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

    const space = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "product-specs-revise", install_policy: "authorized_agents" }),
    });
    spaceId = (await space.json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      config: { skip_review: true },
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "spec-agent",
        scopes: ["space:read", "state:transition", "event:emit", "blob:write"],
        capability_acl: ["feature-spec"],
      }),
    });
    token = (await grant.json()).token;

    const open = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "open_spec", arguments: { title: "Revise me" } }),
    });
    specKey = (await open.json()).result.spec_key;

    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "patch_spec_section",
        arguments: { spec_key: specKey, section_id: "s1", title: "S", body: "v1", order: 1 },
      }),
    });
    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
  });

  afterAll(() => cleanup?.());

  test("revise_spec then republish emits version 2", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const revise = await fetch(`${baseUrl}/api/feature-spec/specs/${specKey}/transition`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ event: "revise_spec" }),
    });
    const reviseBody = await revise.json();
    expect(revise.status).toBe(200);
    expect(reviseBody.state).toBe("draft");
    expect(reviseBody.version).toBe(2);

    await fetch(`${baseUrl}/api/feature-spec/specs/${specKey}/publish`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ event: "publish_direct" }),
    });

    const events = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events?from_seq=0`, {
      headers: bootstrap(),
    });
    const tail = await events.json();
    const published = tail.events.filter(
      (e: { payload: { type?: string; version?: number } }) => e.payload?.type === "spec.published",
    );
    expect(published.some((e: { payload: { version: number } }) => e.payload.version === 2)).toBe(true);
  });
});
