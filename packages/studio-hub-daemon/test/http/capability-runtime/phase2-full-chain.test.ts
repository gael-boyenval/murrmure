import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { buildScaffoldBundle, type StagedBundle } from "../../helpers/cdk-install.js";

const PACKAGE_ID = "phase2-demo";

describe("capability-runtime/phase2-full-chain", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let staged: StagedBundle;
  let spaceId: string;

  const bootstrap = () => ({
    Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
    "Content-Type": "application/json",
  });

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-full-chain-"));
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
      staged?.cleanup();
      rmSync(dir, { recursive: true, force: true });
    };

    staged = await buildScaffoldBundle({ packageId: PACKAGE_ID, hubDataDir: dataDir });

    const sandbox = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ slug: "cdk-full-chain", name: "Sandbox", install_policy: "authorized_agents" }),
    });
    spaceId = (await sandbox.json()).space_id;
  });

  afterAll(() => cleanup?.());

  test("push → install → validate → test → apply → live worker", async () => {
    const install = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/install`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        flow_id: PACKAGE_ID,
        version: staged.version,
        target_state: "draft",
        bundle: { mode: "local-path", local_path: staged.stageDir },
      }),
    });
    expect(install.status).toBe(200);
    const installBody = await install.json();
    expect(installBody.install_id).toBeTruthy();
    expect(installBody.bundle_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const installId = installBody.install_id;

    const validate = await fetch(`${baseUrl}/v1/spaces/${spaceId}/evolution/validate`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ install_id: installId }),
    });
    expect(validate.status).toBe(200);

    const tested = await fetch(`${baseUrl}/v1/spaces/${spaceId}/evolution/test`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({ install_id: installId }),
    });
    expect(tested.status).toBe(200);

    const apply = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/${installId}/apply`, {
      method: "POST",
      headers: bootstrap(),
    });
    expect(apply.status).toBe(200);
    const applyBody = await apply.json();
    expect(applyBody.mount_applied).toBe(true);

    const live = await fetch(`${baseUrl}/v1/spaces/${spaceId}/flows/live`, {
      headers: bootstrap(),
    });
    const liveBody = await live.json();
    const mount = (liveBody.mounts as Array<{ package_id: string; routes_prefix: string }>).find(
      (m) => m.package_id === PACKAGE_ID,
    );
    expect(mount?.routes_prefix).toBe(`/api/${PACKAGE_ID}`);

    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrap(),
      body: JSON.stringify({
        label: "dev-worker",
        scopes: ["space:read", "flow:install"],
        capability_acl: [PACKAGE_ID],
      }),
    });
    const grantToken = (await grant.json()).token;

    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${grantToken}` },
    });
    const names = ((await catalog.json()).tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("ping");

    const health = await fetch(`${baseUrl}/api/${PACKAGE_ID}/health`);
    expect(health.status).toBe(200);
    const healthBody = await health.json();
    expect(healthBody).toMatchObject({ ok: true, flow: PACKAGE_ID });

    const shell = await fetch(`${baseUrl}/flows/${PACKAGE_ID}/${staged.version}/ui/shell.html`);
    expect(shell.status).toBe(200);
    expect(shell.headers.get("content-type")).toContain("text/html");

    const traversal = await fetch(
      `${baseUrl}/flows/${PACKAGE_ID}/${staged.version}/ui/..%2f..%2fmanifest.json`,
    );
    expect(traversal.status).toBe(404);
  });
});
