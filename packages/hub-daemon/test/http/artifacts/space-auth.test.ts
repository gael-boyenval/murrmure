import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/artifacts/space-auth", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceB: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-artifact-space-auth-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN00000006";
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

    const auth = bootstrapHeaders();
    const createdA = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "auth-a", name: "Auth A" }),
    });
    spaceA = (await createdA.json()).space_id;

    const createdB = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ slug: "auth-b", name: "Auth B" }),
    });
    spaceB = (await createdB.json()).space_id;

    const projectB = mkdtempSync(join(tmpdir(), "artifact-auth-b-"));
    await fetch(`${baseUrl}/v1/spaces/${spaceB}/link`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ path: projectB, primary: true }),
    });
  });

  afterAll(() => cleanup?.());

  function bootstrapHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
      "Content-Type": "application/json",
    };
  }

  async function mintScopedToken(spaceId: string, scopes: string[]) {
    const grant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapHeaders(),
      body: JSON.stringify({ label: `scoped-${scopes.join("-")}`, scopes }),
    });
    expect(grant.status).toBe(200);
    return (await grant.json()).token as string;
  }

  test("PUT rejects scoped token writing to another space", async () => {
    const token = await mintScopedToken(spaceA, ["space:write"]);
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceB,
        "x-murrmure-name": "cross-space.txt",
        "x-murrmure-authorized-readers": spaceA,
      },
      body: Buffer.from("nope", "utf-8"),
    });
    expect(put.status).toBe(403);
    const body = await put.json();
    expect(body.code).toBe("scope_enforcement_failure");
  });

  test("materialize rejects scoped token targeting another space", async () => {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        ...bootstrapHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": "shared.txt",
        "x-murrmure-authorized-readers": spaceB,
      },
      body: Buffer.from("shared", "utf-8"),
    });
    expect(put.status).toBe(201);
    const { artifact } = await put.json();

    const token = await mintScopedToken(spaceA, ["blob:read"]);
    const materialize = await fetch(`${baseUrl}/v1/artifacts/${artifact.transfer_id}/materialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ space_id: spaceB }),
    });
    expect(materialize.status).toBe(403);
    const body = await materialize.json();
    expect(body.code).toBe("scope_enforcement_failure");
  });
});
