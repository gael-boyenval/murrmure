import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { ControlBus } from "../../../src/control-bus.js";
import { MeetingNotifier } from "../../../src/meeting-notifier.js";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("MeetingNotifier control bus", () => {
  test("publish meeting_said with message_id + since_seq (no MCP client)", async () => {
    const bus = new ControlBus();
    const published: Array<{ method: string; params: Record<string, unknown> }> = [];
    const principal = { space_id: "app", token_id: "tok_1", client_id: "c1" };
    const notifier = new MeetingNotifier({
      publishToPrincipal: (target, message) => {
        expect(target).toEqual(principal);
        const full = bus.publish(target, message);
        published.push({ method: full.method, params: full.params as Record<string, unknown> });
      },
      mcpSessionRegistry: {
        connectedPrincipals: () => [principal],
      } as never,
    });

    await notifier.notifyLiveSeat({
      session_id: "ses_room1",
      participant_id: "ptc_qa",
      message_id: "msg_01JOINONCE000000000001",
      since_seq: 3,
      handler_id: "meeting-qa",
      principal,
    });

    expect(published).toHaveLength(1);
    expect(published[0]?.method).toBe("murrmure/control.meeting_said");
    expect(published[0]?.params).toMatchObject({
      session_id: "ses_room1",
      participant_id: "ptc_qa",
      message_id: "msg_01JOINONCE000000000001",
      since_seq: 3,
      handler_id: "meeting-qa",
    });
    expect(String(published[0]?.params.prompt)).toContain("since_seq: 3");
    expect(String(published[0]?.params.prompt)).not.toContain("hello qa");
  });
});

describe("http/meetings/join-once", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let daemon: Awaited<ReturnType<typeof startHubTestFixtureAsync>>["daemon"];
  let appSpace = "";
  let emitToken = "";
  let mcpToken = "";
  let sessionId = "";
  let designer = "";
  let qa = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-join-once-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000087",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;
    daemon = fixture.daemon;

    appSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-join-once-app",
      name: "App",
    });
    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
          personas: {
            digest: "sha256:join-p",
            file: {
              version: 1,
              personas: [
                { id: "designer", summary: "Product design" },
                { id: "qa", summary: "Quality" },
              ],
            },
          },
          handlers: {
            digest: "sha256:join-h",
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
        })
      ).status,
    ).toBe(200);

    const emitGrant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "join-emit",
        capabilities: ["space:read", "event:emit"],
      }),
    });
    emitToken = ((await emitGrant.json()) as { token: string }).token;

    const mcpGrant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "join-mcp",
        capabilities: ["space:read", "event:emit"],
      }),
    });
    mcpToken = ((await mcpGrant.json()) as { token: string }).token;

    const handshake = await fetch(`${baseUrl}/v1/mcp/session/handshake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mcpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ space_id: appSpace, client_id: "join-once-client", last_ack_seq: 0 }),
    });
    expect(handshake.status).toBe(200);

    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Join-once room",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: appSpace, persona: "qa" },
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
    qa = room.roster.find((s) => s.persona === "qa")!.participant_id;
  });

  afterAll(() => cleanup?.());

  async function emitSaid(text: string) {
    const res = await fetch(`${baseUrl}/v1/spaces/${appSpace}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "mrmr.meeting.said",
        session_id: sessionId,
        payload: { as_participant_id: designer, to: { participant_ids: [qa] }, text },
      }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ event_id: string; seq: number }>;
  }

  test("second said publishes meeting_said with message_id + since_seq", async () => {
    const publish = vi.spyOn(daemon.ctx.controlBus, "publish");
    await emitSaid("first turn for qa");
    await emitSaid("second turn for qa");

    const meetingSaid = publish.mock.calls
      .map((call) => call[1])
      .filter((msg) => msg.method === "murrmure/control.meeting_said");
    expect(meetingSaid.length).toBeGreaterThanOrEqual(1);
    const params = meetingSaid[0]?.params as {
      message_id?: string;
      since_seq?: number;
      session_id?: string;
      participant_id?: string;
      handler_id?: string;
    };
    expect(params.message_id).toMatch(/^msg_/);
    expect(typeof params.since_seq).toBe("number");
    expect(params.session_id).toBe(sessionId);
    expect(params.handler_id).toBe("meeting-qa");
    expect(params.participant_id).toBe(qa);
    publish.mockRestore();
  });
});
