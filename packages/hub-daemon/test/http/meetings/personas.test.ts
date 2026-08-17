import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

const DESIGNER_AD = {
  id: "designer",
  summary: "Product design",
  asks: ["API shape"],
  requests: ["attach a brief"],
};

function personasBundle(handlers: Array<Record<string, unknown>>) {
  return {
    personas: {
      digest: "sha256:meetings-personas",
      file: {
        version: 1,
        personas: [DESIGNER_AD],
      },
    },
    handlers: {
      digest: "sha256:meetings-handlers",
      file: {
        version: 1,
        handlers,
      },
    },
  };
}

const scopedHandler = {
  id: "meeting-designer",
  on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
  type: "mcp_session",
  complete: "explicit",
};

const unscopedHandler = {
  id: "meeting-all",
  on: { event: { type: "mrmr.meeting.said" } },
  type: "mcp_session",
  complete: "explicit",
};

describe("http/meetings/personas", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let spaceId = "";
  let readToken = "";
  let foreignToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-personas-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000080",
    });
    baseUrl = fixture.baseUrl;
    cleanup = fixture.cleanup;
    bootstrapToken = fixture.bootstrapToken;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-personas",
      name: "Meetings Personas",
    });

    const grantRes = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "personas-read", capabilities: ["space:read"] }),
    });
    expect(grantRes.status).toBe(200);
    readToken = ((await grantRes.json()) as { token: string }).token;

    const foreignSpaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-personas-foreign",
      name: "Foreign",
    });
    const foreignGrant = await fetch(`${baseUrl}/v1/spaces/${foreignSpaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "foreign-read", capabilities: ["space:read"] }),
    });
    expect(foreignGrant.status).toBe(200);
    foreignToken = ((await foreignGrant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("apply without personas in bundle still 200", async () => {
    const res = await applySpaceBundle(baseUrl, bootstrapToken, spaceId, {
      actions: {
        digest: "sha256:meetings-actions",
        file: { version: 1, actions: { hello: { executor: "shell" } } },
      },
    });
    expect(res.status).toBe(200);
  });

  test("same-space GET and MCP return ads only", async () => {
    const applyRes = await applySpaceBundle(
      baseUrl,
      bootstrapToken,
      spaceId,
      personasBundle([scopedHandler]),
    );
    expect(applyRes.status).toBe(200);

    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/personas`, {
      headers: { Authorization: `Bearer ${readToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { personas: Array<Record<string, unknown>> };
    expect(body.personas).toEqual([
      {
        id: "designer",
        summary: "Product design",
        asks: ["API shape"],
        requests: ["attach a brief"],
      },
    ]);
    expect(body.personas[0]).not.toHaveProperty("prompt");
    expect(JSON.stringify(body)).not.toContain("meeting-designer");

    const mcpRes = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "murrmure_list_personas", arguments: {} }),
    });
    expect(mcpRes.status).toBe(200);
    const mcpBody = (await mcpRes.json()) as {
      result: { space_id: string; personas: Array<Record<string, unknown>> };
    };
    expect(mcpBody.result.space_id).toBe(spaceId);
    expect(mcpBody.result.personas).toEqual(body.personas);
  });

  test("foreign space token is denied", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/personas`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE);
  });

  test("apply unscoped said handler returns 400 and leaves index unchanged", async () => {
    const before = await fetch(`${baseUrl}/v1/spaces/${spaceId}/personas`, {
      headers: { Authorization: `Bearer ${readToken}` },
    });
    const beforeBody = await before.json();

    const applyRes = await applySpaceBundle(
      baseUrl,
      bootstrapToken,
      spaceId,
      personasBundle([unscopedHandler]),
    );
    expect(applyRes.status).toBe(400);
    const applyBody = (await applyRes.json()) as { code: string };
    expect(applyBody.code).toBe(MURRMURE_DENIAL_CODES.PERSONA_HANDLER_UNSCOPED);

    const after = await fetch(`${baseUrl}/v1/spaces/${spaceId}/personas`, {
      headers: { Authorization: `Bearer ${readToken}` },
    });
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(beforeBody);

    const hooks = await fetch(`${baseUrl}/v1/spaces/${spaceId}/hooks`, {
      headers: { Authorization: `Bearer ${readToken}` },
    });
    const hooksBody = (await hooks.json()) as { hooks: Array<{ id?: string }> };
    expect(hooksBody.hooks.some((row) => row.id === "meeting-designer")).toBe(true);
    expect(hooksBody.hooks.some((row) => row.id === "meeting-all")).toBe(false);
  });
});
