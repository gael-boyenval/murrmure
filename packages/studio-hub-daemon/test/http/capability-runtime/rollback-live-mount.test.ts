import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("capability-runtime/rollback-live-mount", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let token: string;
  let dataDir: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-rollback-"));
    dataDir = join(dir, "data");
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

    const space = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "ui-sandbox-rollback", install_policy: "authorized_agents" }),
    });
    spaceId = (await space.json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      version: "1.0.0",
    });

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "builder",
        scopes: ["space:read", "state:transition", "flow:install"],
        capability_acl: ["feature-spec"],
      }),
    });
    token = (await grant.json()).token;
  });

  afterAll(() => cleanup?.());

  test("rollback 1.1 → 1.0 removes v1.1 tools", async () => {
    const bootstrap = () => ({
      Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
      "Content-Type": "application/json",
    });

    const v11 = await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
      version: "1.1.0",
      apply: false,
    });
    const v11Body = { install_id: v11.install_id };
    await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/${v11Body.install_id}/apply`, {
      method: "POST",
      headers: bootstrap(),
    });

    const rollback = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/rollback`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ flow_id: "feature-spec", to_version: "1.0.0" }),
    });
    expect(rollback.status).toBe(200);
    expect((await rollback.json()).tools_removed).toEqual(
      expect.arrayContaining(["add_context_ref", "transition_spec"]),
    );

    const invoke = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "add_context_ref",
        arguments: { spec_key: "ins_test", kind: "url", ref: "https://example.com" },
      }),
    });
    const body = await invoke.json();
    expect(body.error?.code ?? body.code).toBe("TOOL_NOT_AUTHORIZED");
  });
});
