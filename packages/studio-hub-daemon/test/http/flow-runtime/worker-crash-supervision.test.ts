import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("flow-runtime/worker-crash-supervision", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;
  let dataDir: string;
  let daemon: Awaited<ReturnType<typeof startHubDaemon>>;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cr-worker-crash-"));
    dataDir = join(dir, "data");
    daemon = await startHubDaemon({
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
      body: JSON.stringify({ slug: "worker-crash", install_policy: "authorized_agents" }),
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
  });

  afterAll(() => cleanup?.());

  test("unexpected worker exit auto-unmounts capability", async () => {
    const mount = daemon.ctx.mountRegistry.getMount(spaceId, "feature-spec");
    expect(mount).toBeDefined();
    const digest = mount!.bundle_digest!;
    const worker = daemon.ctx.workerPool.get("feature-spec", digest);
    expect(worker).toBeDefined();

    worker!.process.kill("SIGKILL");

    await new Promise((r) => setTimeout(r, 200));

    expect(daemon.ctx.mountRegistry.getMount(spaceId, "feature-spec")).toBeUndefined();
    expect(daemon.ctx.workerPool.get("feature-spec", digest)).toBeUndefined();

    const catalog = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${spaceId}`, {
      headers: { Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}` },
    });
    const names = ((await catalog.json()).tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).not.toContain("open_spec");
  });
});
