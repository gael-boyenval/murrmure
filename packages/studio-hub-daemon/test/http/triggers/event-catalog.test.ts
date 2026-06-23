import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@studio/hub-core";
import { installExampleCapability } from "../../helpers/example-install.js";

describe("triggers/event-catalog", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-catalog-"));
    const dataDir = join(dir, "data");
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

    spaceId = (await (
      await fetch(`${baseUrl}/v1/spaces`, {
        method: "POST",
        headers: bootstrap(),
        body: JSON.stringify({ slug: "specs-catalog", install_policy: "authorized_agents" }),
      })
    ).json()).space_id;

    await installExampleCapability({
      baseUrl,
      spaceId,
      bootstrapHeaders: bootstrap,
      exampleId: "feature-spec",
      hubDataDir: dataDir,
    });
  });

  afterAll(() => cleanup?.());

  test("lists spec.published after feature-spec live apply", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/triggers/event-catalog`, {
      headers: { Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}` },
    });
    const body = await res.json();
    const types = body.events.map((e: { type: string }) => e.type);
    expect(types).toContain("spec.published");
    expect(types).toContain("work.ready");
    const spec = body.events.find((e: { type: string }) => e.type === "spec.published");
    expect(spec.package_id).toBe("feature-spec");
  });

  test("lists trigger templates", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/triggers/templates`, {
      headers: { Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}` },
    });
    const body = await res.json();
    const ids = body.templates.map((t: { template_id: string }) => t.template_id);
    expect(ids).toContain("spec-published-wake-dev");
    expect(ids).toContain("work-ready-wake-frontend");
  });
});
