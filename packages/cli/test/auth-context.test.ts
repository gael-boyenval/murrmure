import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearAuthContextCache,
  getAuthContext,
  inferTokenMetadata,
  type WhoamiResponse,
} from "../src/lib/auth-context.js";
import type { HubAuth } from "../src/auth.js";

const auth: HubAuth = {
  hubUrl: "http://127.0.0.1:8787",
  token: "tok_test",
};

function mockWhoami(body: WhoamiResponse, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

describe("getAuthContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthContextCache();
  });

  test("bootstrap token with multiple spaces and identical scopes", async () => {
    mockWhoami({
      actor_id: "act_admin",
      kind: "human",
      token_id: "tok_bootstrap",
      spaces: [
        { space_id: "spc_a", scopes: ["space:admin"] },
        { space_id: "spc_b", scopes: ["space:admin"] },
      ],
    });

    const ctx = await getAuthContext(auth);
    expect(ctx).toMatchObject({
      tokenSpaceId: "bootstrap",
      tokenScopes: ["space:admin"],
    });
  });

  test("empty spaces on fresh hub resolves bootstrap with empty tokenScopes", async () => {
    mockWhoami({
      actor_id: "act_admin",
      kind: "human",
      token_id: "tok_bootstrap",
      spaces: [],
    });

    const ctx = await getAuthContext(auth);
    expect(ctx).toMatchObject({
      tokenSpaceId: "bootstrap",
      tokenScopes: [],
    });
  });

  test("single-space token resolves tokenSpaceId and tokenScopes", () => {
    const meta = inferTokenMetadata({
      actor_id: "act_1",
      kind: "agent",
      token_id: "tok_1",
      spaces: [{ space_id: "spc_ui_sandbox", scopes: ["space:read", "event:read"] }],
    });
    expect(meta).toEqual({
      tokenSpaceId: "spc_ui_sandbox",
      tokenScopes: ["space:read", "event:read"],
    });
  });

  test("caches whoami for 60 seconds", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        actor_id: "act_1",
        kind: "human",
        token_id: "tok_1",
        spaces: [{ space_id: "spc_a", scopes: ["space:read"] }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getAuthContext(auth);
    await getAuthContext(auth);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await getAuthContext(auth, { bypassCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
