import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runtimeEventsCommand } from "../src/commands/runtime.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";
import { parseGlobalFlags } from "../src/lib/flags.js";
import { runTokenPreflight } from "../src/lib/preflight.js";

describe("runtime token preflight", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_test";
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("token without space:read passes preflight for matching space", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("http://127.0.0.1:8787/v1/auth/whoami");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_1",
            kind: "agent",
            token_id: "tok_test",
            spaces: [{ space_id: "spc_ui_sandbox", scopes: ["event:read"] }],
          }),
        };
      }),
    );

    const result = await runTokenPreflight({
      json: true,
      space: "spc_ui_sandbox",
    });
    expect(result.spaceId).toBe("spc_ui_sandbox");
  });

  test("token-wrong-space is denied before hub request", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    parseGlobalFlags({ json: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("http://127.0.0.1:8787/v1/auth/whoami");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_1",
            kind: "agent",
            token_id: "tok_test",
            spaces: [{ space_id: "spc_ui_sandbox", scopes: ["event:read"] }],
          }),
        };
      }),
    );

    await runTokenPreflight({
      json: true,
      space: "spc_other",
    });

    expect(exit).toHaveBeenCalledWith(1);
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as { code: string };
    expect(payload.code).toBe("TOKEN_WRONG_SPACE");
  });

  test("runtime events calls hub with credential auth when token-for-space passes", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_1",
            kind: "agent",
            token_id: "tok_test",
            spaces: [{ space_id: "spc_ui_sandbox", scopes: ["event:read"] }],
          }),
        };
      }
      if (url.includes("/v1/spaces/spc_ui_sandbox/events")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ events: [{ seq: 1 }] }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (runtimeEventsCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { json: true, space: "spc_ui_sandbox", from_seq: "0" },
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces/spc_ui_sandbox/events?from_seq=0",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok_test",
        }),
      }),
    );

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      ok: boolean;
      events?: unknown[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.events).toHaveLength(1);
  });
});
