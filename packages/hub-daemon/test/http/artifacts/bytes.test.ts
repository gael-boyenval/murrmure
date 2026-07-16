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
  let daemon: Awaited<ReturnType<typeof startHubDaemon>>;

  const bare = (id: string) => (id.startsWith("spc_") ? id.slice(4) : id);

  function authHeaders() {
    return {
      Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
    };
  }

  /**
   * Mint a token row directly so the bytes endpoint's credential-bound ACL can
   * be exercised against a real persisted token (not the bootstrap admin token).
   * `consumerSpaceId` binds a federated resolve token to a consumer space; a
   * same-space `blob:read` token omits it. Returns the bearer (`tok_<id>`).
   */
  async function mintToken(opts: {
    spaceId: string;
    consumerSpaceId?: string;
    scopes?: string[];
  }): Promise<string> {
    const tokenId = `testtok_${Math.random().toString(36).slice(2)}`;
    const scopes = opts.scopes ?? ["step:resolve"];
    await daemon.ctx.murrmurePersistence.insertToken(
      {
        token_id: tokenId,
        actor_id: "actor_test",
        space_id: bare(opts.spaceId),
        scopes,
        capabilities: scopes,
        harness_id: "run:run_test",
        scope_ref: "run_test:build:handler",
        status: "active",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumer_space_id: opts.consumerSpaceId ? bare(opts.consumerSpaceId) : undefined,
      },
      new Date().toISOString(),
    );
    return `tok_${tokenId}`;
  }

  beforeAll(async () => {
    hubDataDir = mkdtempSync(join(tmpdir(), "hub-artifact-bytes-"));
    bootstrapToken = "01JBOOTSTRAPTOKEN0000000B";
    daemon = await startHubDaemon({
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
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": spaceA,
        "x-murrmure-name": input.name,
        "x-murrmure-authorized-readers": input.authorized_readers.join(","),
      },
      body: Buffer.from(input.content, "utf8"),
    });
    expect(put.status).toBe(201);
    return (await put.json()) as { artifact: { transfer_id: string; digest: string } };
  }

  test("serves bytes to a consumer-bound resolve token with a digest header", async () => {
    const content = "openapi-bytes";
    const { artifact } = await upload({ name: "openapi.json", content, authorized_readers: [spaceB] });
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceB });

    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-murrmure-digest")).toBe(artifact.digest);
    expect(res.headers.get("x-murrmure-name")).toBe("openapi.json");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString("utf8")).toBe(content);
  });

  test("serves bytes to a same-space scoped token reading its own space", async () => {
    const content = "same-space-bytes";
    const { artifact } = await upload({ name: "same.json", content, authorized_readers: [spaceA] });
    const token = await mintToken({ spaceId: spaceA, scopes: ["blob:read"] });

    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceA}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString("utf8")).toBe(content);
  });

  test("rejects a bootstrap token claiming another ACL-authorized space (binding killed)", async () => {
    const { artifact } = await upload({ name: "bootstrap-target.json", content: "bootstrap-target-bytes", authorized_readers: [spaceB] });
    // The bootstrap admin token is not bound to any consumer space, so it may
    // not claim spaceB's ACL-authorized bytes through the bytes endpoint.
    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: authHeaders() },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");
  });

  test("rejects a consumer-bound token claiming the wrong consumer space", async () => {
    const { artifact } = await upload({ name: "wrong-space.json", content: "wrong-space-bytes", authorized_readers: [spaceB] });
    // Bound to spaceA but claiming spaceB → wrong-space at the binding gate.
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceA });
    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");
  });

  test("rejects a consumer-bound requester not listed in authorized_readers with 403", async () => {
    const { artifact } = await upload({ name: "private.json", content: "secret", authorized_readers: [spaceB] });
    // Bound to spaceA (binding passes) but spaceA is NOT in authorized_readers → ACL 403.
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceA });
    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceA}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");
  });

  test("returns 404 for an unknown transfer id", async () => {
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceB });
    const res = await fetch(`${baseUrl}/v1/artifacts/xfr_unknown/bytes?space_id=${spaceB}`, {
      headers: { Authorization: `Bearer ${token}` },
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
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceB });

    const res = await fetch(
      `${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes?space_id=${spaceB}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("ARTIFACT_DIGEST_MISMATCH");
  });

  test("rejects a request with no space_id query parameter", async () => {
    const { artifact } = await upload({ name: "no-query.json", content: "no-query-bytes", authorized_readers: [spaceB] });
    const token = await mintToken({ spaceId: spaceA, consumerSpaceId: spaceB });
    const res = await fetch(`${baseUrl}/v1/artifacts/${artifact.transfer_id}/bytes`, {
      headers: { Authorization: `Bearer ${token}` },
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
