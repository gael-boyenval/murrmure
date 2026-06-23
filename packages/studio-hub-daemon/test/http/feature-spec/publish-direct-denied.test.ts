import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("feature-spec/publish-direct-denied", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;
  let specKey: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-deny-"));
    const dataDir = join(dir, "data");
    const daemon = await startHubDaemon({
      databasePath: join(dir, "studio.db"),
      port: 0,
      dataDir,
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

    const space = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "product-specs", install_policy: "authorized_agents" }),
    });
    spaceId = (await space.json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      config: { skip_review: false },
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
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  test("publish_direct denied when skip_review is false", async () => {
    const open = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "open_spec",
        arguments: { title: "Blocked direct publish" },
      }),
    });
    specKey = (await open.json()).result.spec_key;

    await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        name: "transition_spec",
        arguments: { spec_key: specKey, event: "context_ready" },
      }),
    });

    const pub = await fetch(`${baseUrl}/api/feature-spec/specs/${specKey}/publish`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ event: "publish_direct" }),
    });
    expect(pub.status).toBe(403);
    const body = await pub.json();
    expect(body.code).toBe("TRANSITION_GUARD_FAILED");
    expect(body.guard).toBe("skip_review");
  });
});
