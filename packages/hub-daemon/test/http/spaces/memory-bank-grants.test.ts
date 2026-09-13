import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/spaces/memory-bank-grants", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let ownerSpace = "";
  let readerSpace = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "memory-bank-grants-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000090",
    });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;
    bootstrapToken = fixture.bootstrapToken;

    ownerSpace = await createSpace(baseUrl, bootstrapToken, { slug: "grant-owner" });
    readerSpace = await createSpace(baseUrl, bootstrapToken, { slug: "grant-reader" });
    const applyRes = await applySpaceBundle(baseUrl, bootstrapToken, ownerSpace, {
      space: {
        digest: "sha256:grant-owner",
        file: {
          apiVersion: "murrmure.space/v1",
          slug: "grant-owner",
          name: "Owner",
          memory_bank: "kb",
        },
      },
    });
    expect(applyRes.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  test("POST GET DELETE memory bank grants", async () => {
    const created = await fetch(`${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reader_space_id: readerSpace }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      grant: { grant_id: string; reader_space_id: string; target_bank: string };
    };
    expect(createdBody.grant.reader_space_id).toBe(readerSpace);
    expect(createdBody.grant.target_bank).toBe("kb");
    expect(createdBody.grant.grant_id.startsWith("mbg_")).toBe(true);

    const listed = await fetch(`${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { grants: Array<{ grant_id: string }> };
    expect(listBody.grants.map((row) => row.grant_id)).toContain(createdBody.grant.grant_id);

    const revoked = await fetch(
      `${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants/${createdBody.grant.grant_id}`,
      { method: "DELETE", headers: bootstrapAuth(bootstrapToken) },
    );
    expect(revoked.status).toBe(200);
    const after = await fetch(`${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(((await after.json()) as { grants: unknown[] }).grants).toEqual([]);
  });

  test("POST cannot grant a foreign bank", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${ownerSpace}/memory-bank-grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reader_space_id: readerSpace, target_bank: "doctrine" }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("MEMORY_GRANT_DENIED");
  });
});
