import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";
import { addTokenId } from "@murrmure/hub-core";

describe("http/meetings/artifact-preview", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-art-",
      bootstrapToken: "01JBOOTSTRAPTOKEN0000008A",
    });
    baseUrl = fixture.baseUrl;
    bootstrapToken = fixture.bootstrapToken;
    cleanup = fixture.cleanup;

    appSpace = await createSpace(baseUrl, bootstrapToken, { slug: "meetings-art-app", name: "App" });
    researchSpace = await createSpace(baseUrl, bootstrapToken, {
      slug: "meetings-art-research",
      name: "Research",
    });

    expect(
      (
        await applySpaceBundle(baseUrl, bootstrapToken, appSpace, {
      personas: {
        digest: "sha256:art-app-p",
        file: { version: 1, personas: [{ id: "designer", summary: "d" }] },
      },
      handlers: {
        digest: "sha256:art-app-h",
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
        digest: "sha256:art-res-p",
        file: { version: 1, personas: [{ id: "researcher", summary: "r" }] },
      },
      handlers: {
        digest: "sha256:art-res-h",
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
  });

  afterAll(() => cleanup?.());

  test("chair can preview a said artifact without claiming the sender space", async () => {
    const convened = await fetch(`${baseUrl}/v1/meetings`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        title: "Notes",
        participants: [
          { space_id: appSpace, persona: "designer" },
          { space_id: researchSpace, persona: "researcher" },
        ],
        chair: { human: true },
      }),
    });
    expect(convened.status).toBe(201);
    const { session_id } = (await convened.json()) as { session_id: string };

    const put = await fetch(`${baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${addTokenId(bootstrapToken)}`,
        "Content-Type": "application/octet-stream",
        "x-murrmure-space-id": appSpace,
        "x-murrmure-name": "note.md",
        "x-murrmure-authorized-readers": appSpace,
      },
      body: Buffer.from("# Hello\n\n**team**", "utf-8"),
    });
    expect(put.status).toBe(201);
    const { artifact } = (await put.json()) as { artifact: { transfer_id: string } };

    const said = await fetch(`${baseUrl}/v1/sessions/${session_id}/meeting/say`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        to: { all: true },
        text: "note attached",
        artifacts: [artifact.transfer_id],
      }),
    });
    expect(said.status).toBe(200);

    const preview = await fetch(
      `${baseUrl}/v1/sessions/${session_id}/artifacts/${artifact.transfer_id}?preview=1`,
      { headers: bootstrapAuth(bootstrapToken) },
    );
    expect(preview.status).toBe(200);
    const body = await preview.json();
    expect(body.artifact.name).toBe("note.md");
    expect(body.preview.text).toContain("Hello");

    const missing = await fetch(`${baseUrl}/v1/sessions/${session_id}/artifacts/xfr_unknown?preview=1`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("ARTIFACT_NOT_IN_MEETING");
  });
});
