import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

function meetingHandlers(id: string, persona: string) {
  return {
    digest: `sha256:handlers-${id}`,
    file: {
      version: 1,
      handlers: [
        {
          id,
          contract_keys: [],
          on: { event: { type: "mrmr.meeting.said", participant: persona } },
          type: "mcp_session",
          complete: "explicit",
        },
      ],
    },
  };
}

describe("http/meetings/convene", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";
  let startToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-convene-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000084",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-app", name: "App" });
    researchSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-research",
      name: "Research",
    });

    const appApply = await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
      personas: {
        digest: "sha256:app-personas",
        file: {
          version: 1,
          personas: [
            { id: "designer", summary: "Product design" },
            { id: "qa", summary: "Quality" },
          ],
        },
      },
      handlers: {
        digest: "sha256:app-handlers",
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
            {
              id: "meeting-qa",
              contract_keys: [],
              on: { event: { type: "mrmr.meeting.said", participant: "qa" } },
              type: "mcp_session",
              complete: "explicit",
            },
          ],
        },
      },
    });
    expect(appApply.status).toBe(200);

    const researchApply = await applySpaceBundle(baseUrl, bootstrapToken, researchSpace, {
      personas: {
        digest: "sha256:res-personas",
        file: { version: 1, personas: [{ id: "researcher", summary: "Prior art" }] },
      },
      handlers: meetingHandlers("meeting-researcher", "researcher"),
    });
    expect(researchApply.status).toBe(200);

    const grant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "convene",
        capabilities: ["flow:run", "space:read", "event:emit"],
      }),
    });
    expect(grant.status).toBe(200);
    startToken = ((await grant.json()) as { token: string }).token;
  });

  afterAll(() => cleanup?.());

  test("POST /v1/meetings convenes three seats on one session", async () => {
    const res = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "API shape",
        goal: "Pick an approach",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: appSpace, persona: "qa" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { space_id: appSpace, persona: "designer" },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      session_id: string;
      roster: Array<{ participant_id: string; space_id: string; persona?: string }>;
    };
    expect(body.session_id).toMatch(/^ses_/);
    expect(body.roster).toHaveLength(3);
    expect(body.roster.every((seat) => seat.participant_id.startsWith("ptc_"))).toBe(true);

    const session = await fetch(`${baseUrl}/v1/sessions/${body.session_id}`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((r) => r.json() as Promise<{ spaces_touched: string[] }>);
    expect(session.spaces_touched).toEqual(expect.arrayContaining([appSpace, researchSpace]));

    const listed = await fetch(`${baseUrl}/v1/meetings`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((r) => r.json() as Promise<{ meetings: Array<{ session_id: string; title: string }> }>);
    expect(listed.meetings.some((row) => row.session_id === body.session_id && row.title === "API shape")).toBe(
      true,
    );
  });

  test("MCP start and attach to existing session_id", async () => {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ title: "Existing room", space_id: appSpace }),
    });
    expect(sessionRes.status).toBe(201);
    const sessionId = ((await sessionRes.json()) as { session_id: string }).session_id;

    const mcp = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${appSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${startToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_start_meeting",
        arguments: {
          title: "Attached room",
          session_id: sessionId,
          participants: [
            { space_id: appSpace, persona: "designer" },
            { space_id: researchSpace, persona: "researcher" },
          ],
          chair: { human: true },
        },
      }),
    });
    expect(mcp.status).toBe(200);
    const body = (await mcp.json()) as { result?: { session_id?: string }; session_id?: string };
    const returned = body.result?.session_id ?? body.session_id;
    expect(returned).toBe(sessionId);
  });

  test("human chair can message selected seats with timestamped latency", async () => {
    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Human chair room",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { human: true },
      }),
    });
    expect(convene.status).toBe(201);
    const room = (await convene.json()) as {
      session_id: string;
      roster: Array<{ participant_id: string; persona?: string }>;
    };
    const researcher = room.roster.find((seat) => seat.persona === "researcher")!;

    const said = await fetch(
      `${baseUrl}/v1/sessions/${room.session_id}/meeting/say`,
      {
        method: "POST",
        headers: bootstrapAuth(bootstrapToken),
        body: JSON.stringify({
          to: { participant_ids: [researcher.participant_id] },
          text: "Please check the current latency.",
        }),
      },
    );
    expect(said.status).toBe(200);

    const transcript = await fetch(
      `${baseUrl}/v1/sessions/${room.session_id}/transcript`,
      { headers: bootstrapAuth(bootstrapToken) },
    ).then((res) => res.json() as Promise<{
      messages: Array<{
        created_at: string;
        from: { human: true };
        to: { participant_ids: string[] };
        receipts: Array<{ recorded_at: string; latency_ms: number }>;
      }>;
    }>);
    expect(transcript.messages[0]).toMatchObject({
      from: { human: true },
      to: { participant_ids: [researcher.participant_id] },
    });
    expect(Date.parse(transcript.messages[0]!.created_at)).not.toBeNaN();
    expect(transcript.messages[0]!.receipts[0]?.latency_ms).toBeGreaterThanOrEqual(0);
  });
});
