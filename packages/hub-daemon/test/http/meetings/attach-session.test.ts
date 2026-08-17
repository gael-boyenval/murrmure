import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/meetings/attach-session", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let spaceId = "";
  let sessionId = "";
  let emitToken = "";
  let readToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-attach-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000083",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    spaceId = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-attach",
      name: "Meetings Attach",
    });

    const link = await fetch(`${baseUrl}/v1/spaces/${spaceId}/link`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        host: "local",
        path: fixture.dataDir,
        primary: true,
      }),
    });
    expect(link.status).toBe(200);

    const apply = await applySpaceBundle(baseUrl, bootstrapToken, spaceId, {
      personas: {
        digest: "sha256:attach-personas",
        file: {
          version: 1,
          personas: [{ id: "designer", summary: "Product design" }],
        },
      },
      actions: {
        digest: "sha256:attach-actions",
        file: {
          version: 1,
          actions: {
            "meeting-designer": { executor: "shell", command: "echo said" },
          },
        },
      },
      executors: {
        digest: "sha256:attach-executors",
        file: {
          executors: {
            shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
          },
        },
      },
      handlers: {
        digest: "sha256:attach-handlers",
        file: {
          version: 1,
          handlers: [
            {
              id: "meeting-designer",
              contract_keys: [],
              on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
              type: "shell_spawn",
              complete: "explicit",
              command: "echo meeting-said",
            },
          ],
        },
      },
    });
    expect(apply.status).toBe(200);

    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ title: "Meeting room", space_id: spaceId }),
    });
    expect(sessionRes.status).toBe(201);
    sessionId = ((await sessionRes.json()) as { session_id: string }).session_id;

    const emitGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "attach-emit",
        capabilities: ["space:read", "event:emit"],
      }),
    });
    expect(emitGrant.status).toBe(200);
    emitToken = ((await emitGrant.json()) as { token: string }).token;

    const readGrant = await fetch(`${baseUrl}/v1/spaces/${spaceId}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "attach-read",
        capabilities: ["space:read"],
      }),
    });
    expect(readGrant.status).toBe(200);
    readToken = ((await readGrant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("two said-like emits with session_id keep one ses_*", async () => {
    for (const n of [1, 2]) {
      const emit = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${emitToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "mrmr.meeting.said",
          session_id: sessionId,
          payload: { text: `turn ${n}`, participant: "designer" },
        }),
      });
      expect(emit.status).toBe(200);
      const body = (await emit.json()) as { event_id: string; type: string; seq: number };
      expect(body.type).toBe("mrmr.meeting.said");
      expect(body.event_id).toBeTruthy();
      expect(body.seq).toBeGreaterThan(0);
      expect(body.seq).not.toBeUndefined();
    }

    const sessions = await fetch(`${baseUrl}/v1/sessions`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((res) => res.json() as Promise<{ sessions: Array<{ session_id: string; title: string }> }>);
    expect(sessions.sessions).toHaveLength(1);
    expect(sessions.sessions[0]?.session_id).toBe(sessionId);
    expect(sessions.sessions.some((row) => row.title === "Handler meeting-designer")).toBe(false);
  });

  test("missing session_id → 400 MEETING_SESSION_REQUIRED", async () => {
    const emit = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "mrmr.meeting.said",
        payload: { text: "no room", participant: "designer" },
      }),
    });
    expect(emit.status).toBe(400);
    const body = (await emit.json()) as { code: string };
    expect(body.code).toBe(MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED);
  });

  test("no event:emit → 403", async () => {
    const emit = await fetch(`${baseUrl}/v1/spaces/${spaceId}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "mrmr.meeting.said",
        session_id: sessionId,
        payload: { text: "denied", participant: "designer" },
      }),
    });
    expect(emit.status).toBe(403);
    const body = (await emit.json()) as { code: string };
    expect(body.code).toBe(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE);
  });
});
