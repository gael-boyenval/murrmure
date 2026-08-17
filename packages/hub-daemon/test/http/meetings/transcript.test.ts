import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/meetings/transcript", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";
  let foreignSpace = "";
  let rosterToken = "";
  let journalToken = "";
  let foreignToken = "";
  let sessionId = "";
  let designer = "";
  let researcher = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-transcript-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000087",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-tx-app", name: "App" });
    researchSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-tx-research",
      name: "Research",
    });
    foreignSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-tx-foreign",
      name: "Foreign",
    });

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
          personas: {
            digest: "sha256:tx-app-p",
            file: {
              version: 1,
              personas: [
                { id: "designer", summary: "Product design" },
                { id: "qa", summary: "Quality" },
              ],
            },
          },
          handlers: {
            digest: "sha256:tx-app-h",
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

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, researchSpace, {
          personas: {
            digest: "sha256:tx-res-p",
            file: { version: 1, personas: [{ id: "researcher", summary: "Prior art" }] },
          },
          handlers: {
            digest: "sha256:tx-res-h",
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

    const rosterGrant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "tx-roster",
        capabilities: ["space:read", "event:emit"],
      }),
    });
    rosterToken = ((await rosterGrant.json()) as { token: string }).token;

    const journalGrant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "tx-journal",
        capabilities: ["journal:read"],
      }),
    });
    journalToken = ((await journalGrant.json()) as { token: string }).token;

    const foreignGrant = await fetch(`${baseUrl}/v1/spaces/${foreignSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "tx-foreign",
        capabilities: ["space:read", "journal:read"],
      }),
    });
    foreignToken = ((await foreignGrant.json()) as { token: string }).token;

    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Transcript room",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: appSpace, persona: "qa" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { space_id: appSpace, persona: "designer" },
      }),
    });
    expect(convene.status).toBe(201);
    const room = (await convene.json()) as {
      session_id: string;
      roster: Array<{ participant_id: string; persona?: string }>;
    };
    sessionId = room.session_id;
    designer = room.roster.find((s) => s.persona === "designer")!.participant_id;
    researcher = room.roster.find((s) => s.persona === "researcher")!.participant_id;

    const said = await fetch(`${baseUrl}/v1/spaces/${appSpace}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rosterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "mrmr.meeting.said",
        session_id: sessionId,
        payload: {
          as_participant_id: designer,
          to: { participant_ids: [researcher] },
          text: "Need the last latency study.",
        },
      }),
    });
    expect(said.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  test("GET transcript for roster token includes said + receipts", async () => {
    const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/transcript`, {
      headers: { Authorization: `Bearer ${rosterToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session_id: string;
      status: string;
      messages: Array<{
        text?: string;
        to: { all: boolean; participant_ids: string[] };
        receipts: Array<{ participant_id: string; status: string }>;
      }>;
    };
    expect(body.session_id).toBe(sessionId);
    expect(body.status).toBe("open");
    expect(body.messages.some((m) => m.text === "Need the last latency study.")).toBe(true);
    const said = body.messages.find((m) => m.text === "Need the last latency study.");
    expect(said?.to.participant_ids).toContain(researcher);
    expect(said?.receipts.some((r) => r.participant_id === researcher)).toBe(true);
  });

  test("journal:read on a roster space is allowed", async () => {
    const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/transcript`, {
      headers: { Authorization: `Bearer ${journalToken}` },
    });
    expect(res.status).toBe(200);
  });

  test("foreign space token is denied even with journal:read", async () => {
    const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}/transcript`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    expect(res.status).toBe(403);
  });

  test("MCP murrmure_meeting_transcript returns the projection", async () => {
    const res = await fetch(`${baseUrl}/v1/mcp/tools/call?space_id=${appSpace}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rosterToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "murrmure_meeting_transcript",
        arguments: { session_id: sessionId, since_seq: 0 },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { session_id?: string; messages?: unknown[] };
      session_id?: string;
    };
    expect(body.result?.session_id ?? body.session_id).toBe(sessionId);
  });

  test("closed meeting still 200", async () => {
    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Close then read",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { human: true },
      }),
    });
    expect(convene.status).toBe(201);
    const closedId = ((await convene.json()) as { session_id: string }).session_id;
    const close = await fetch(`${baseUrl}/v1/sessions/${closedId}/meeting/close`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reason: "goal reached" }),
    });
    expect(close.status).toBe(200);

    const res = await fetch(`${baseUrl}/v1/sessions/${closedId}/transcript`, {
      headers: { Authorization: `Bearer ${rosterToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("closed");
  });

  test("session without a meeting is 404", async () => {
    const created = await fetch(`${baseUrl}/v1/sessions`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ title: "No room", space_id: appSpace }),
    });
    const emptyId = ((await created.json()) as { session_id: string }).session_id;
    const res = await fetch(`${baseUrl}/v1/sessions/${emptyId}/transcript`, {
      headers: { Authorization: `Bearer ${rosterToken}` },
    });
    expect(res.status).toBe(404);
  });
});
