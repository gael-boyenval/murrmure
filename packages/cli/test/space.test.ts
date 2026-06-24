import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSpaceOnHub,
  listSpacesOnHub,
  spaceCreateCommand,
  spaceListCommand,
} from "../src/commands/space/commands.js";
import { clearAuthContextCache } from "../src/lib/auth-context.js";
import { parseGlobalFlags } from "../src/lib/flags.js";
import { runGlobalScopePreflight } from "../src/lib/preflight.js";
import type { HubAuth } from "../src/auth.js";

describe("space CRUD", () => {
  const envSnapshot = { ...process.env };
  const auth: HubAuth = {
    hubUrl: "http://127.0.0.1:8787",
    token: "tok_bootstrap",
  };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.MURRMURE_HUB_URL = auth.hubUrl;
    process.env.MURRMURE_HUB_TOKEN = auth.token;
    clearAuthContextCache();
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("empty whoami bootstrap passes preflight for space create", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toBe("http://127.0.0.1:8787/v1/auth/whoami");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            kind: "human",
            token_id: "tok_bootstrap",
            spaces: [],
          }),
        };
      }),
    );

    const result = await runGlobalScopePreflight({ json: true }, "space:admin");
    expect(result.ctx.tokenSpaceId).toBe("bootstrap");
  });

  test("createSpaceOnHub posts expected body on empty hub", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/spaces") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toEqual({
          slug: "ui-sandbox",
          name: "UI Sandbox",
          install_policy: "human_only",
          preview_policy: "same_origin_only",
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            space_id: "spc_ui_sandbox",
            slug: "ui-sandbox",
            name: "UI Sandbox",
            status: "active",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const space = await createSpaceOnHub(auth, {
      slug: "ui-sandbox",
      name: "UI Sandbox",
    });
    expect(space.space_id).toBe("spc_ui_sandbox");
  });

  test("space list fetches GET /v1/spaces and prints table", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_1",
            kind: "human",
            token_id: "tok_1",
            spaces: [{ space_id: "spc_a", scopes: ["space:enter", "space:admin"] }],
          }),
        };
      }
      if (url.endsWith("/v1/spaces")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            spaces: [
              {
                space_id: "spc_ui_sandbox",
                slug: "ui-sandbox",
                name: "UI Sandbox",
                status: "active",
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (spaceListCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {},
      rawArgs: [],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/v1/spaces",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok_bootstrap" }),
      }),
    );
    expect(String(log.mock.calls[0]?.[0])).toContain("spc_ui_sandbox");
  });

  test("space create command with empty whoami bootstrap", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v1/auth/whoami")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            actor_id: "act_admin",
            kind: "human",
            token_id: "tok_bootstrap",
            spaces: [],
          }),
        };
      }
      if (url.endsWith("/v1/spaces") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            space_id: "spc_ui_sandbox",
            slug: "ui-sandbox",
            name: "UI Sandbox",
            status: "active",
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (spaceCreateCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        slug: "ui-sandbox",
        name: "UI Sandbox",
      },
      rawArgs: [],
    });

    expect(String(log.mock.calls[0]?.[0])).toBe("spc_ui_sandbox");
  });

  test("listSpacesOnHub returns spaces array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          spaces: [{ space_id: "spc_a", slug: "a", status: "active" }],
        }),
      })),
    );

    const spaces = await listSpacesOnHub(auth);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].space_id).toBe("spc_a");
  });
});

describe("space create json mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("space create --json emits structured ok payload", async () => {
    process.env.MURRMURE_HUB_URL = "http://127.0.0.1:8787";
    process.env.MURRMURE_HUB_TOKEN = "tok_bootstrap";
    clearAuthContextCache();
    parseGlobalFlags({ json: true });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/v1/auth/whoami")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              actor_id: "act_admin",
              kind: "human",
              token_id: "tok_bootstrap",
              spaces: [],
            }),
          };
        }
        if (url.endsWith("/v1/spaces") && init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              space_id: "spc_ui_sandbox",
              slug: "ui-sandbox",
              name: "UI Sandbox",
              status: "active",
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await (spaceCreateCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: {
        json: true,
        slug: "ui-sandbox",
        name: "UI Sandbox",
      },
      rawArgs: [],
    });

    const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      ok: boolean;
      space_id?: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.space_id).toBe("spc_ui_sandbox");
  });
});
