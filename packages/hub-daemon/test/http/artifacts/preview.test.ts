import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/artifacts/preview", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-artifact-preview-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN0000000P";
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

    const created = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ slug: "preview-a", name: "Preview A" }),
    });
    spaceA = (await created.json()).space_id;
  });

  afterAll(() => cleanup?.());

  function authHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
  }

  async function mintScopedToken(scopes: string[]) {
    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceA}/grants`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ label: `preview-${scopes.join("-")}`, scopes }),
    });
    expect(grant.status).toBe(200);
    return (await grant.json()).token as string;
  }

  test("GET metadata with preview=1 returns capped text for space:read", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "note.md",
        "x-murrmure-authorized-readers": spaceA,
      },
      body: Buffer.from("# Hello\n\n**team**", "utf-8"),
    });
    expect(put.status).toBe(201);
    const { artifact } = await put.json();

    const token = await mintScopedToken(["space:read"]);
    const get = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}?space_id=${encodeURIComponent(spaceA)}&preview=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.artifact.name).toBe("note.md");
    expect(body.preview).toEqual({
      text: "# Hello\n\n**team**",
      truncated: false,
      name: "note.md",
    });
  });

  test("GET preview omits text for binary names", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "photo.png",
        "x-murrmure-authorized-readers": spaceA,
      },
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]),
    });
    expect(put.status).toBe(201);
    const { artifact } = await put.json();

    const get = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}?space_id=${encodeURIComponent(spaceA)}&preview=1`,
      { headers: authHeaders() },
    );
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.preview).toBeNull();
  });
});
