import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  applySpaceBundle,
  bootstrapAuth,
  createSpace,
  startHubTestFixtureAsync,
} from "../../helpers/space-fixture.js";

const API_SHAPE_MANIFEST = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "api-shape",
  description: "Designer and researcher agree the API shape, then implement",
  triggers: { manual: true },
  steps: [
    {
      id: "decide",
      description: "Designer and researcher agree the API shape",
      meeting: {
        participants: [
          { space: "{{input.app_space}}", persona: "designer" },
          { space: "{{input.research_space}}", persona: "researcher" },
        ],
        chair: { space: "{{input.app_space}}", persona: "designer" },
        goal: "{{input.goal}}",
      },
    },
    { id: "implement", description: "Build what the meeting decided" },
  ],
};

describe("http/meetings/flow-step", () => {
  let baseUrl = "";
  let bootstrapToken = "";
  let cleanup: (() => void) | undefined;
  let appSpace = "";
  let researchSpace = "";

  beforeAll(async () => {
    const fixture = await startHubTestFixtureAsync({
      prefix: "meetings-flow-step-",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000087",
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
        digest: "sha256:flow-app-p",
        file: {
          version: 1,
          personas: [
            { id: "designer", summary: "Product design" },
            { id: "qa", summary: "Quality" },
          ],
        },
      },
      handlers: {
        digest: "sha256:flow-app-h",
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
      flows: [
        {
          digest: "sha256:api-shape",
          flow_id: "flw_api_shape",
          rel_path: "flows/api-shape/flow.manifest.yaml",
          manifest: API_SHAPE_MANIFEST,
        },
      ],
    });
    expect(appApply.status).toBe(200);

    const researchApply = await applySpaceBundle(baseUrl, bootstrapToken, researchSpace, {
      personas: {
        digest: "sha256:flow-res-p",
        file: { version: 1, personas: [{ id: "researcher", summary: "Prior art" }] },
      },
      handlers: {
        digest: "sha256:flow-res-h",
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
    });
    expect(researchApply.status).toBe(200);
  });

  afterAll(() => cleanup?.());

  test("opening decide convenes on this session; close advances to implement", async () => {
    const start = await fetch(`${baseUrl}/v1/flows/flw_api_shape/run`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({
        space_id: appSpace,
        input: {
          app_space: appSpace,
          research_space: researchSpace,
          goal: "Pick pagination",
        },
      }),
    });
    expect(start.status).toBe(201);
    const started = (await start.json()) as { session_id?: string; run_id: string; session?: { session_id: string } };
    const sessionId = started.session_id ?? started.session?.session_id;
    const runId = started.run_id;
    expect(sessionId).toMatch(/^ses_/);

    const transcript = await fetch(`${baseUrl}/v1/sessions/${sessionId}/transcript`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(transcript.status).toBe(200);
    const room = (await transcript.json()) as {
      session_id: string;
      status: string;
      roster: Array<{ persona?: string }>;
    };
    expect(room.session_id).toBe(sessionId);
    expect(room.status).toBe("open");
    expect(room.roster.map((seat) => seat.persona)).toEqual(
      expect.arrayContaining(["designer", "researcher"]),
    );

    const before = await fetch(`${baseUrl}/v1/runs/${runId}`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(before.status).toBe(200);
    const beforeBody = (await before.json()) as {
      open_steps: Array<{ step_id: string }>;
      steps: Array<{ step_id: string; status: string }>;
    };
    expect(beforeBody.open_steps.map((step) => step.step_id)).toContain("decide");
    expect(beforeBody.steps.find((step) => step.step_id === "decide")?.status).toBe("working");

    const close = await fetch(`${baseUrl}/v1/sessions/${sessionId}/meeting/close`, {
      method: "POST",
      headers: bootstrapAuth(bootstrapToken),
      body: JSON.stringify({ reason: "goal reached", outcome: "cursor pagination" }),
    });
    expect(close.status).toBe(200);

    const after = await fetch(`${baseUrl}/v1/runs/${runId}`, {
      headers: bootstrapAuth(bootstrapToken),
    });
    expect(after.status).toBe(200);
    const afterBody = (await after.json()) as {
      open_steps: Array<{ step_id: string }>;
      steps: Array<{ step_id: string; status: string }>;
    };
    expect(afterBody.steps.find((step) => step.step_id === "decide")?.status).toBe("completed");
    expect(afterBody.open_steps.map((step) => step.step_id)).toContain("implement");
    expect(afterBody.steps.find((step) => step.step_id === "implement")?.status).toBe("working");
  });
});
