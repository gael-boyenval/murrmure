import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/sessions/list", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceId: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-sessions-list-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000008";
    const daemon = await startHubDaemon({
      databasePath: join(dir, "murrmure.db"),
      port: 0,
      dataDir: join(dir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(dir, { recursive: true, force: true });
    };

    const auth = {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "sessions-list", name: "Sessions List" }),
    });
    spaceId = (await created.json()).space_id;
  });

  afterAll(() => cleanup?.());

  const auth = () => ({
    Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    "Content-Type": "application/json",
  });

  test("list sessions filtered by status", async () => {
    const create = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ title: "Active demo", space_id: spaceId }),
    });
    expect(create.status).toBe(201);

    const list = await fetch(`${baseUrl}/v1/sessions?status=active&space_id=${spaceId}`, {
      headers: auth(),
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { sessions: Array<{ title: string; status: string }> };
    expect(body.sessions.some((s) => s.title === "Active demo" && s.status === "active")).toBe(true);
  });
});
