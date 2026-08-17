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
  let otherToken = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-close-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000086",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-close-app", name: "App" });
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
  });

  afterAll(() => cleanup?.());

  test("non-chair HTTP close is denied", async () => {
    const convene = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Seat chair",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: appSpace, persona: "qa" },
        ],
        chair: { space_id: appSpace, persona: "designer" },
      }),
    });
    expect(convene.status).toBe(201);
    const sessionId = ((await convene.json()) as { session_id: string }).session_id;

    const close = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${otherToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "not the chair" }),
    });
    expect(close.status).toBe(403);
    expect(((await close.json()) as { code: string }).code).toBe(
      MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED,
    );
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
  });
});
