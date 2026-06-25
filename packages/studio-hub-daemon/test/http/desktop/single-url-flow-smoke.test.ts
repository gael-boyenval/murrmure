import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addTokenId } from "@murrmure/hub-core";
import { startHubDaemon } from "../../../src/main.js";
import { installExampleCapability } from "../../helpers/example-install.js";

const BOOTSTRAP_TOKEN = "01JBOOTSTRAPTOKEN00000001";
const SHELL_MARKER = "desktop-single-url-shell-root";

describe("http/desktop/single-url-flow-smoke", () => {
  let daemon: Awaited<ReturnType<typeof startHubDaemon>> | null = null;
  let scratchDir = "";
  let dataDir = "";
  let baseUrl = "";
  let spaceId = "";
  let flowVersion = "";

  const bootstrapHeaders = () => ({
    Authorization: `Bearer ${addTokenId(BOOTSTRAP_TOKEN)}`,
    "Content-Type": "application/json",
  });

  beforeAll(async () => {
    scratchDir = mkdtempSync(join(tmpdir(), "hub-desktop-single-url-"));
    dataDir = join(scratchDir, "data");
    const shellStaticDir = join(scratchDir, "shell-dist");
    mkdirSync(shellStaticDir, { recursive: true });
    writeFileSync(
      join(shellStaticDir, "index.html"),
      `<!doctype html><html><body><div id="root">${SHELL_MARKER}</div></body></html>`,
    );

    daemon = await startHubDaemon({
      databasePath: join(scratchDir, "studio.db"),
      port: 0,
      dataDir,
      defaultSpaceId: "",
      bootstrapToken: BOOTSTRAP_TOKEN,
      shellStaticDir,
      embedded: true,
    });
    baseUrl = `http://127.0.0.1:${daemon.port}`;

    const spaceRes = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: bootstrapHeaders(),
      body: JSON.stringify({ slug: "desktop-smoke", install_policy: "authorized_agents" }),
    });
    expect(spaceRes.status).toBe(200);
    spaceId = (await spaceRes.json()).space_id as string;

    const installed = await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
    });
    flowVersion = installed.staged.version;
  });

  afterAll(async () => {
    if (daemon) {
      await daemon.shutdown();
    }
    if (scratchDir) {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  test("serves shell, flow UI, and worker API on one origin", async () => {
    const rootRes = await fetch(`${baseUrl}/`);
    expect(rootRes.status).toBe(200);
    expect(rootRes.headers.get("content-type")).toContain("text/html");
    expect(await rootRes.text()).toContain(SHELL_MARKER);

    const flowUiRes = await fetch(`${baseUrl}/flows/feature-spec/${flowVersion}/ui/shell.html`);
    expect(flowUiRes.status).toBe(200);
    expect(flowUiRes.headers.get("content-type")).toContain("text/html");

    const proxiedRes = await fetch(`${baseUrl}/api/feature-spec/health`);
    expect(proxiedRes.status).toBe(200);
    expect(await proxiedRes.json()).toMatchObject({ ok: true, flow: "feature-spec" });

    const unmountedRes = await fetch(`${baseUrl}/api/foo`);
    expect(unmountedRes.status).toBe(404);
    expect(await unmountedRes.text()).not.toContain(SHELL_MARKER);
  });

  test("strips internal trust headers before worker proxy", async () => {
    const proxiedRes = await fetch(`${baseUrl}/api/feature-spec/health`, {
      headers: {
        "X-Murrmure-Internal-Space": "spc_evil",
        "X-Murrmure-Caller-Token": "tok_evil",
      },
    });
    expect(proxiedRes.status).toBe(200);
    expect(await proxiedRes.json()).toMatchObject({ ok: true, flow: "feature-spec" });
  });
});
