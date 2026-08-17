import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { meetingStartCommand } from "../src/commands/meeting/start.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";

describe("meeting cli", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...envSnapshot,
      MURRMURE_HUB_URL: "http://127.0.0.1:8787",
      MURRMURE_HUB_TOKEN: "tok_admin",
    };
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("posts convene body to /v1/meetings", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            token_id: "tok_admin",
            spaces: [{ space_id: "spc_app", scopes: ["flow:run", "space:read"] }],
          }),
        };
      }
      if (url.endsWith("/v1/meetings") && init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ ok: true, session_id: "ses_room" }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await (meetingStartCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        json: true,
        space: "spc_app",
        title: "API shape",
        goal: "Pick an approach",
        chair: "spc_app:designer",
        participant: ["spc_app:designer", "spc_app:qa", "spc_research:researcher"],
      },
      rawArgs: [],
    });

    const convene = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/v1/meetings"));
    expect(convene).toBeTruthy();
    expect(convene?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String((convene?.[1] as RequestInit).body))).toEqual({
      title: "API shape",
      goal: "Pick an approach",
      participants: [
        { space_id: "spc_app", persona: "designer" },
        { space_id: "spc_app", persona: "qa" },
        { space_id: "spc_research", persona: "researcher" },
      ],
      chair: { space_id: "spc_app", persona: "designer" },
    });
  });
});
