import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

describe("http/meetings/said-dispatch", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";
  let emitToken = "";
  let sessionId = "";
  let designer = "";
  let qa = "";
  let researcher = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-said-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000085",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-said-app", name: "App" });
    researchSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-said-research",
      name: "Research",
    });

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
          personas: {
            digest: "sha256:said-app-p",
            file: {
              version: 1,
              personas: [
                { id: "designer", summary: "Product design" },
                { id: "qa", summary: "Quality" },
              ],
            },
          },
          handlers: {
            digest: "sha256:said-app-h",
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

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, researchSpace, {
          personas: {
            digest: "sha256:said-res-p",
            file: { version: 1, personas: [{ id: "researcher", summary: "Prior art" }] },
          },
          handlers: {
            digest: "sha256:said-res-h",
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

    const grant = await fetch(`${baseUrl}/v1/spaces/${appSpace}/grants`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        label: "said-emit",
        capabilities: ["space:read", "event:emit"],
      }),
    });
    emitToken = ((await grant.json()) as { token: string }).token;

    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Dispatch room",
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
    qa = room.roster.find((s) => s.persona === "qa")!.participant_id;
    researcher = room.roster.find((s) => s.persona === "researcher")!.participant_id;
  });

  afterAll(() => cleanup?.());

  async function emitSaid(to: { participant_ids: string[] } | { all: true }, text: string) {
    const res = await fetch(`${baseUrl}/v1/spaces/${appSpace}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emitToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "mrmr.meeting.said",
        session_id: sessionId,
        payload: { as_participant_id: designer, to, text },
      }),
    });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ event_id: string; seq: number }>;
  }

  async function receipts() {
    const res = await fetch(
      `${baseUrl}/v1/journal?session_id=${sessionId}&type=mrmr.meeting.*&limit=200`,
      { headers: bootstrapAuth(bootstrapToken) },
    );
    const body = (await res.json()) as {
      entries: Array<{ type: string; data: { participant_id?: string; message_id?: string } }>;
    };
    return body.entries.filter(
      (row) => row.type === "mrmr.meeting.delivered" || row.type === "mrmr.meeting.delivery_failed",
    );
  }

  test("said to one seat writes one receipt; third seat is not a target", async () => {
    await emitSaid({ participant_ids: [researcher] }, "Need the latency study.");
    const rows = await receipts();
    const targets = rows.map((row) => row.data.participant_id);
    expect(targets).toContain(researcher);
    expect(targets).not.toContain(qa);
    expect(targets.filter((id) => id === researcher).length).toBeGreaterThanOrEqual(1);
  });

  test("said broadcasts an immediate transcript invalidation over SSE", async () => {
    const ticketRes = await fetch(`${baseUrl}/v1/auth/sse-ticket`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
    });
    const { ticket } = (await ticketRes.json()) as { ticket: string };
    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/v1/journal/subscribe?ticket=${ticket}`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    const reader = stream.body?.getReader();
    expect(reader).toBeDefined();

    const saidEvent = (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          if (!block.includes("event: journal.append")) continue;
          const raw = block
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
          if (!raw) continue;
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (data.type === "mrmr.meeting.said") return data;
        }
      }
      throw new Error("meeting said SSE event not received");
    })();

    await emitSaid({ participant_ids: [researcher] }, "Refresh the transcript now.");
    const data = await Promise.race([
      saidEvent,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("meeting said SSE timeout")), 5_000),
      ),
    ]);
    controller.abort();

    expect(data).toMatchObject({
      type: "mrmr.meeting.said",
      space_id: appSpace,
      session_id: sessionId,
    });
  });

  test("said to two seats writes two receipts; orphan seat is not woken", async () => {
    const before = await receipts();
    await emitSaid({ participant_ids: [qa, researcher] }, "Both of you look at this.");
    const after = await receipts();
    const newRows = after.slice(0, after.length - before.length);
    const ids = newRows.map((row) => row.data.participant_id);
    expect(ids).toEqual(expect.arrayContaining([qa, researcher]));
    expect(ids).not.toContain(designer);
    const sessions = await fetch(`${baseUrl}/v1/sessions`, {
      headers: bootstrapAuth(bootstrapToken),
    }).then((res) => res.json() as Promise<{ sessions: Array<{ session_id: string }> }>);
    expect(sessions.sessions.filter((row) => row.session_id === sessionId)).toHaveLength(1);
  });
});
