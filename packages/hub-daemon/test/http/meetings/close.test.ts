import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/meetings/close", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";
  let otherToken = "";
  let agentToken = "";
  let foreignAgentToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-close-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000086",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-close-app", name: "App" });
    researchSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-close-research",
      name: "Research",
    });
    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
          personas: {
            digest: "sha256:close-p",
            file: {
              version: 1,
              personas: [
                { id: "designer", summary: "Product design" },
                { id: "qa", summary: "Quality" },
              ],
            },
          },
          handlers: {
            digest: "sha256:close-h",
            file: {
              version: 1,
              handlers: [
                {
                  id: "meeting-designer",
                  contract_keys: [],
                  on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
                  type: "mcp_session",
                  complete: "explicit",
                },
              ],
            },
          },
        })
      ).status,
    ).toBe(200);

    const grant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "close-other",
        capabilities: ["space:read", "event:emit", "flow:run"],
      }),
    });
    otherToken = ((await grant.json()) as { token: string }).token;

    const agentGrant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "close-agent",
        harness: "cursor",
        capabilities: ["space:read", "space:write", "event:emit", "flow:run"],
      }),
    });
    agentToken = ((await agentGrant.json()) as { token: string }).token;

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, researchSpace, {
          personas: {
            digest: "sha256:close-research-p",
            file: { version: 1, personas: [{ id: "researcher", summary: "Research" }] },
          },
          handlers: {
            digest: "sha256:close-research-h",
            file: {
              version: 1,
              handlers: [
                {
                  id: "meeting-researcher",
                  contract_keys: [],
                  on: { event: { type: "mrmr.meeting.said", participant: "researcher" } },
                  type: "mcp_session",
                  complete: "explicit",
                },
              ],
            },
          },
        })
      ).status,
    ).toBe(200);

    const foreignGrant = await fetch(`${baseUrl}/v1/spaces/${researchSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "close-foreign-agent",
        harness: "cursor",
        capabilities: ["space:read", "space:write", "event:emit", "flow:run"],
      }),
    });
    foreignAgentToken = ((await foreignGrant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("foreign agent HTTP close is denied; roster human can say and close", async () => {
    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Seat chair",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { space_id: appSpace, persona: "designer" },
      }),
    });
    expect(convene.status).toBe(201);
    const sessionId = ((await convene.json()) as { session_id: string }).session_id;

    const agentClose = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${foreignAgentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "invitee seat, not convenor" }),
    });
    expect(agentClose.status).toBe(403);
    expect(((await agentClose.json()) as { code: string }).code).toBe(
      MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED,
    );

    const say = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/say`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${otherToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: { all: true }, text: "operator joining" }),
    });
    expect(say.status).toBe(200);

    const close = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${otherToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "kill expensive seats" }),
    });
    expect(close.status).toBe(200);
    expect(((await close.json()) as { status: string }).status).toBe("closed");
  });

  test("human-chair HTTP close succeeds", async () => {
    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Human chair",
        participants: [{ space_id: appSpace, persona: "designer" }],
        chair: { human: true },
      }),
    });
    expect(convene.status).toBe(201);
    const sessionId = ((await convene.json()) as { session_id: string }).session_id;

    const close = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/close`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reason: "goal reached", outcome: "ship it" }),
    });
    expect(close.status).toBe(200);
    const body = (await close.json()) as { status: string; outcome: string };
    expect(body.status).toBe("closed");
    expect(body.outcome).toBe("completed");

    const listed = await fetch(`${baseUrl}/v1/meetings`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((r) => r.json() as Promise<{ meetings: Array<{ session_id: string; status: string }> }>);
    expect(listed.meetings.some((row) => row.session_id === sessionId && row.status === "closed")).toBe(
      true,
    );

    const resume = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/resume`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(resume.status).toBe(200);
    const resumed = (await resume.json()) as { session_id: string; status: string };
    expect(resumed.session_id).toBe(sessionId);
    expect(resumed.status).toBe("open");
  });

  test("convenor agent can close via murrmure_close_meeting", async () => {
    const start = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${appSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_start_meeting",
        arguments: {
          title: "Agent convened",
          goal: "Ship it",
          participants: [
            { space_id: appSpace, persona: "designer" },
            { space_id: researchSpace, persona: "researcher" },
          ],
          chair: { space_id: appSpace, persona: "designer" },
        },
      }),
    });
    expect(start.status).toBe(200);
    const started = (await start.json()) as {
      result?: { session_id?: string };
      session_id?: string;
    };
    const sessionId = started.result?.session_id ?? started.session_id;
    expect(sessionId).toBeTruthy();

    const denied = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${researchSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${foreignAgentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_close_meeting",
        arguments: { session_id: sessionId, reason: "invitee cannot close" },
      }),
    });
    expect(denied.status).toBe(500);
    expect(((await denied.json()) as { message?: string }).message ?? "").toMatch(/CHAIR|chair/i);

    const closed = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${appSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_close_meeting",
        arguments: { session_id: sessionId, reason: "goal reached", outcome: "ship it" },
      }),
    });
    expect(closed.status).toBe(200);
    const body = (await closed.json()) as {
      result?: { status?: string };
      status?: string;
    };
    expect(body.result?.status ?? body.status).toBe("closed");
  });
});
