import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { requireToken, type TokenContext } from "../../src/auth.js";
import type { TokenRow } from "@murrmure/hub-persistence";

function makeToken(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    token_id: "01JXTOKEN000000000000000A",
    actor_id: "act_test",
    space_id: "bootstrap",
    scopes: ["step:resolve"],
    capabilities: ["step:resolve"],
    harness_id: "run:run_demo",
    status: "active",
    ...overrides,
  };
}

function bearerReq(tokenId: string): Request {
  return new Request("http://127.0.0.1/v1/runs/run_demo/steps/write_spec/resolve", {
    headers: { Authorization: `Bearer tok_${tokenId}` },
  });
}

describe("requireToken — ephemeral credential lifecycle", () => {
  test("an active, unexpired, in-scope token is accepted and exposes scope_ref", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertToken(
      makeToken({ scope_ref: "run_demo:write_spec", expires_at: new Date(Date.now() + 60_000).toISOString() }),
      new Date().toISOString(),
    );
    const result = await requireToken(studio, bearerReq("01JXTOKEN000000000000000A"));
    expect((result as TokenContext).scope_ref).toBe("run_demo:write_spec");
    expect((result as TokenContext).token_id).toBe("tok_01JXTOKEN000000000000000A");
  });

  test("an expired active token is denied", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertToken(
      makeToken({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
      new Date().toISOString(),
    );
    const result = await requireToken(studio, bearerReq("01JXTOKEN000000000000000A"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test("a revoked token is denied even before its expiry", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertToken(
      makeToken({ expires_at: new Date(Date.now() + 60_000).toISOString() }),
      new Date().toISOString(),
    );
    await studio.revokeToken("01JXTOKEN000000000000000A");
    const result = await requireToken(studio, bearerReq("01JXTOKEN000000000000000A"));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test("a token with no expiry is accepted (non-ephemeral tokens unaffected)", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertToken(makeToken(), new Date().toISOString());
    const result = await requireToken(studio, bearerReq("01JXTOKEN000000000000000A"));
    expect((result as TokenContext).actor_id).toBe("act_test");
  });
});
