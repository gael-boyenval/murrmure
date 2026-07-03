import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("murrmure/shared-config (BC6b project registry)", () => {
  let baseUrl: string;
  let cleanup: () => void;

  const bootstrap = () => ({
    Authorization: `Bearer ${addTokenId("01JBOOTSTRAPTOKEN00000001")}`,
    "Content-Type": "application/json",
  });

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-config-"));
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
    });
    const port = (daemon.server.address() as { port: number }).port;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };
  });

  afterAll(() => cleanup?.());

  test("requires a valid token", async () => {
    const res = await fetch(`${baseUrl}/v1/murrmure/shared-config`);
    expect(res.status).toBe(403);
  });

  test("persists and reads back flow projects", async () => {
    const projects = [{ flow_id: "review-loop", source: "/repo/workflows/review-loop" }];
    const put = await fetch(`${baseUrl}/v1/murrmure/shared-config/projects`, {
      method: "PUT",
      headers: bootstrap(),
      body: JSON.stringify({ flowProjects: projects }),
    });
    expect(put.status).toBe(200);
    expect((await put.json()).flowProjects).toEqual(projects);

    const get = await fetch(`${baseUrl}/v1/murrmure/shared-config`, { headers: bootstrap() });
    const body = await get.json();
    expect(body.flowProjects).toEqual(projects);
  });

  test("drops malformed project entries", async () => {
    const put = await fetch(`${baseUrl}/v1/murrmure/shared-config/projects`, {
      method: "PUT",
      headers: bootstrap(),
      body: JSON.stringify({ flowProjects: [{ flow_id: "", source: "x" }, { source: "no-id" }, 42] }),
    });
    expect((await put.json()).flowProjects).toEqual([]);
  });
});
