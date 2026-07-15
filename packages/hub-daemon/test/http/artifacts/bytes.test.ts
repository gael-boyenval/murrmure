import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId, exchangeFilePath } from "@murrmure/hub-core";

/**
 * Producer-side `GET /v1/artifacts/:transfer_id/bytes` endpoint — the surface a
 * federated consumer uses to fetch relayed artifact references. Enforces the
 * same ACL / expiry / digest checks as the local materialize path; the
 * destination's `loadRelayedArtifactBytes` maps each non-200 status to a typed
 * validation error with `artifacts_in` parity.
 */
describe("http/artifacts/bytes", () => {
  let baseUrl: string;
  let cleanup: () => void;
  let bootstrapToken: string;
  let spaceA: string;
  let spaceB: string;
  let hubDataDir: string;

  function authHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    };
  }

  beforeAll(async () => {
    hubDataDir = mkdtempSync(join(tmpdir(), "hub-artifact-bytes-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN0000000B";
    const daemon = await startHubDaemon({
      databasePath: join(hubDataDir, "murrmure.db"),
      port: 0,
      dataDir: join(hubDataDir, "data"),
      defaultSpaceId: "",
      bootstrapToken,
    });
    const addr = daemon.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 8787;
    baseUrl = `http://127.0.0.1:${port}`;
    cleanup = () => {
      daemon.server.close();
      rmSync(hubDataDir, { recursive: true, force: true });
    };

    const auth = authHeaders();
    const createdA = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bytes-a", name: "Bytes A" }),
    });
    spaceA = (await createdA.json()).space_id;
    const createdB = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "bytes-b", name: "Bytes B" }),
    });
    spaceB = (await createdB.json()).space_id;
  });

  afterAll(() => cleanup?.());

  async function upload(input: { name: string; content: string; authorized_readers: string[] }) {
    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        space_id: spaceA,
        name: input.name,
        content_base64: Buffer.from(input.content, "utf8").toString("base64"),
        authorized_readers: input.authorized_readers,
      }),
    });
    expect(put.status).toBe(201);
    return (await put.json()) as { artifact: { transfer_id: string; digest: string } };
  }

  test("serves bytes to an ACL-authorized requester with a digest header", async () => {
    const content = "openapi-bytes";
    const { artifact } = await upload({ name: "openapi.json", content, authorized_readers: [spaceB] });

    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-murrmure-digest")).toBe(artifact.digest);
    expect(res.headers.get("x-murrmure-name")).toBe("openapi.json");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString("utf8")).toBe(content);
  });

  test("rejects a requester not listed in authorized_readers with 403", async () => {
    const { artifact } = await upload({ name: "private.json", content: "secret", authorized_readers: [spaceB] });

    // spaceA is the source but is NOT in authorized_readers.
    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceA}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");
  });

  test("returns 404 for an unknown transfer id", async () => {
    const res = await fetch(`${baseUrl}/v1/artifacts/xfr_unknown/bytes?space_id=${spaceB}`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_NOT_FOUND");
  });

  test("returns 422 when exchange bytes no longer match the registered digest", async () => {
    const { artifact } = await upload({ name: "tamper.json", content: "original", authorized_readers: [spaceB] });
    const exchangePath = exchangeFilePath(join(hubDataDir, "data"), artifact.transfer_id, "tamper.json");
    expect(existsSync(exchangePath)).toBe(true);
    writeFileSync(exchangePath, "tampered");

    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_DIGEST_MISMATCH");
  });

  test("rejects a request with no space_id query parameter", async () => {
    const { artifact } = await upload({ name: "no-query.json", content: "x", authorized_readers: [spaceB] });
    const res = await fetch(`${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a request with no bearer token", async () => {
    const { artifact } = await upload({ name: "no-auth.json", content: "no-auth-unique", authorized_readers: [spaceB] });
    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
    );
    expect(res.status).toBe(403);
  });
});
