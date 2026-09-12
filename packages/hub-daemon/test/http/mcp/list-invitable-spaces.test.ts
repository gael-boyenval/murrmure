import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

const DESIGNER = {
  id: "designer",
  summary: "Product design",
  asks: ["API shape"],
  requests: ["attach a brief"],
};

function personasBundle(
  personas: Array<Record<string, unknown>>,
  handlers: Array<Record<string, unknown>>,
) {
  return {
    personas: {
      digest: `sha256:invitable-${personas.map((row) => row.id).join("-")}`,
      file: { version: 1, personas },
    },
    handlers: {
      digest: `sha256:invitable-handlers-${handlers.map((row) => row.id).join("-")}`,
      file: { version: 1, handlers },
    },
  };
}

const designerHandler = {
  id: "meeting-designer",
  on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
  type: "mcp_session",
  complete: "explicit",
};

describe("http/mcp/list-invitable-spaces", () => {
  let baseUrl = "";
  let cleanup: (() => void) | undefined;
  let bootstrapToken = "";
  let callerSpace = "";
  let readableSpace = "";
  let emptySpace = "";
  let ungrantedSpace = "";
  let harnessOnlySpace = "";
  let callerToken = "";
  let adminToken = "";
  let foreignToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "mcp-invitable-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000093",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    callerSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-caller",
      name: "Caller",
    });
    readableSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-readable",
      name: "Readable",
    });
    emptySpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-empty",
      name: "Empty",
    });
    ungrantedSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-ungranted",
      name: "Ungranted",
    });
    harnessOnlySpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-harness",
      name: "Harness only",
    });

    expect(
      (
        await applySpaceBundle(
          baseUrl,
          bootstrapToken,
          callerSpace,
          personasBundle(
            [{ id: "owner", summary: "Home seat" }],
            [
              {
                id: "meeting-owner",
                on: { event: { type: "mrmr.meeting.said", participant: "owner" } },
                type: "mcp_session",
                complete: "explicit",
              },
            ],
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await applySpaceBundle(
          baseUrl,
          bootstrapToken,
          readableSpace,
          personasBundle([DESIGNER], [designerHandler]),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, emptySpace, {
          handlers: { digest: "sha256:empty-handlers", file: { version: 1, handlers: [] } },
        })
      ).status,
    ).toBe(200);

    const callerGrant = await fetch(`${baseUrl}/v1/spaces/${callerSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "caller",
        capabilities: ["space:read", "flow:run"],
      }),
    });
    expect(callerGrant.status).toBe(200);
    callerToken = ((await callerGrant.json()) as { token: string }).token;

    const readableGrant = await fetch(`${baseUrl}/v1/spaces/${readableSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "readable", capabilities: ["space:read"] }),
    });
    expect(readableGrant.status).toBe(200);

    const emptyGrant = await fetch(`${baseUrl}/v1/spaces/${emptySpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "empty-read", capabilities: ["space:read"] }),
    });
    expect(emptyGrant.status).toBe(200);

    const harnessGrant = await fetch(`${baseUrl}/v1/spaces/${harnessOnlySpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "harness-only",
        harness: "cursor",
        capabilities: ["space:read"],
      }),
    });
    expect(harnessGrant.status).toBe(200);

    const adminGrant = await fetch(`${baseUrl}/v1/spaces/${callerSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ label: "admin", capabilities: ["hub:admin"] }),
    });
    expect(adminGrant.status).toBe(200);
    adminToken = ((await adminGrant.json()) as { token: string }).token;

    const foreignSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "invitable-foreign",
      name: "Foreign",
    });
    const foreignGrant = await fetch(`${baseUrl}/v1/spaces/${foreignSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "foreign-read",
        harness: "foreign",
        capabilities: ["space:read"],
      }),
    });
    expect(foreignGrant.status).toBe(200);
    foreignToken = ((await foreignGrant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  function call(token: string, spaceId?: string, args: Record<string, unknown> = {}) {
    const url = spaceId
      ? `${baseUrl}/v1/mcp/tools/call?space_id=${spaceId}`
      : `${baseUrl}/v1/mcp/tools/call`;
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "murrmure_list_invitable_spaces", arguments: args }),
    });
  }

  test("catalog advertises the directory tool for space:read", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/catalog?space_id=${callerSpace}`, {
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tools: Array<{ name: string; inputSchema?: Record<string, unknown> }>;
    };
    const tool = body.tools.find((entry) => entry.name === "murrmure_list_invitable_spaces");
    expect(tool).toBeTruthy();
    expect(tool?.inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });

  test("ordinary caller sees own space plus matching grants, not ungranted or harness-mismatched", async () => {
    const res = await call(callerToken, callerSpace);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: {
        spaces: Array<{
          space_id: string;
          slug: string;
          name: string;
          personas: Array<Record<string, unknown>>;
        }>;
      };
    };
    expect(body.result.spaces.map((space) => space.space_id).sort()).toEqual(
      [callerSpace, emptySpace, readableSpace].sort(),
    );
    expect(body.result.spaces.map((space) => space.space_id)).not.toContain(ungrantedSpace);
    expect(body.result.spaces.map((space) => space.space_id)).not.toContain(harnessOnlySpace);

    const readable = body.result.spaces.find((space) => space.space_id === readableSpace);
    expect(readable).toEqual({
      space_id: readableSpace,
      slug: "invitable-readable",
      name: "Readable",
      personas: [DESIGNER],
    });
    expect(JSON.stringify(readable)).not.toContain("meeting-designer");

    const empty = body.result.spaces.find((space) => space.space_id === emptySpace);
    expect(empty?.personas).toEqual([]);
  });

  test("bootstrap and hub:admin see every active space", async () => {
    const bootstrapRes = await call(bootstrapToken);
    expect(bootstrapRes.status).toBe(200);
    const bootstrapBody = (await bootstrapRes.json()) as {
      result: { spaces: Array<{ space_id: string }> };
    };
    const bootstrapIds = bootstrapBody.result.spaces.map((space) => space.space_id);
    expect(bootstrapIds).toEqual(
      expect.arrayContaining([callerSpace, readableSpace, emptySpace, ungrantedSpace, harnessOnlySpace]),
    );

    const adminRes = await call(adminToken, callerSpace);
    expect(adminRes.status).toBe(200);
    const adminBody = (await adminRes.json()) as { result: { spaces: Array<{ space_id: string }> } };
    expect(adminBody.result.spaces.map((space) => space.space_id)).toEqual(
      expect.arrayContaining([ungrantedSpace, harnessOnlySpace]),
    );
  });

  test("foreign GET personas stays denied; discovered ids convene unchanged", async () => {
    const denied = await fetch(`${baseUrl}/v1/spaces/${readableSpace}/personas`, {
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { code: string }).code).toBe(
      MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
    );

    const listed = await call(callerToken, callerSpace);
    const directory = (await listed.json()) as {
      result: { spaces: Array<{ space_id: string; personas: Array<{ id: string }> }> };
    };
    const readable = directory.result.spaces.find((space) => space.space_id === readableSpace);
    expect(readable?.space_id).toBe(readableSpace);

    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${callerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Directory roster",
        participants: [{ space_id: readable!.space_id, persona: readable!.personas[0]!.id }],
        chair: { human: true },
      }),
    });
    expect(convene.status).toBe(201);
    const convened = (await convene.json()) as { ok: boolean; session_id: string };
    expect(convened.ok).toBe(true);
    expect(convened.session_id).toMatch(/^ses_/);
  });

  test("foreign space token is not a directory for another space", async () => {
    const res = await fetch(`${baseUrl}/v1/spaces/${readableSpace}/personas`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    expect(res.status).toBe(403);
  });
});
