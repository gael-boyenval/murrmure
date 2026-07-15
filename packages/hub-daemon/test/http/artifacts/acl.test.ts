import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/artifacts/acl", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceC: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-artifact-acl-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000005";
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

    const auth = authHeaders();
    const createdA = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "acl-a", name: "ACL A" }),
    });
    spaceA = (await createdA.json()).space_id;

    const createdC = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "acl-c", name: "ACL C" }),
    });
    spaceC = (await createdC.json()).space_id;
  });

  afterAll(() => cleanup?.());

  function authHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
  }

  test("denies fetch when requester space is not in authorized_readers", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "secret.txt",
        "x-murrmure-authorized-readers": spaceA,
      },
      body: Buffer.from("secret", "utf-8"),
    });
    const { artifact } = await put.json();

    const get = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}?space_id=${encodeURIComponent(spaceC)}`,
      { headers: authHeaders() },
    );
    expect(get.status).toBe(403);
    const body = await get.json();
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");
  });
});
