import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("flow-runtime/grant-scoped-tool-list", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let sandboxId: string;
  let workerToken: string;
  let builderToken: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-grant-scoped-"));
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

    const sandbox = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "ui-sandbox", name: "UI Sandbox", install_policy: "authorized_agents" }),
    });
    sandboxId = (await sandbox.json()).space_id;

    for (const exampleId of ["review-loop", "feature-spec"] as const) {
      await installExampleCapability({
        baseUrl,
        spaceId: sandboxId,
        bootstrapHeaders: bootstrap,
        exampleId,
        hubDataDir: dataDir,
      });
    }

    const workerGrant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "worker-no-feature-spec",
        harness: "worker-1",
        scopes: ["space:read", "state:transition", "event:emit"],
        flow_acl: ["review-loop"],
      }),
    });
    workerToken = (await workerGrant.json()).token;

    const builderGrant = await fetch(`${baseUrl}/v1/spaces/${sandboxId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "builder-with-feature-spec",
        scopes: ["space:read", "state:transition", "flow:install"],
        flow_acl: ["review-loop", "feature-spec"],
      }),
    });
    builderToken = (await builderGrant.json()).token;
  });

  afterAll(() => cleanup?.());

  async function catalog(token: string) {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${sandboxId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    return (await res.json()).tools as Array<{ name: string }>;
  }

  test("worker token excludes feature-spec tools", async () => {
    const tools = await catalog(workerToken);
    const names = tools.map((t) => t.name);
    expect(names).toContain("transition");
    expect(names).toContain("create_review_session");
    expect(names).not.toContain("open_spec");
    expect(names).not.toContain("publish_spec");
  });

  test("builder token includes both capability tool sets", async () => {
    const tools = await catalog(builderToken);
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_review_session");
    expect(names).toContain("open_spec");
    expect(names).toContain("publish_spec");
  });
});
