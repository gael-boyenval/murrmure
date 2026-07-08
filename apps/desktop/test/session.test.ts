import { describe, expect, test, vi } from "vitest";
import {
  createSessionInjectionScript,
  ensureBootstrapSession,
  toBearerToken,
} from "../src/session.js";

describe("toBearerToken", () => {
  test("prefixes bare tokens with tok_", () => {
    expect(toBearerToken("01JBOOTSTRAPTOKEN00000001")).toBe("tok_01JBOOTSTRAPTOKEN00000001");
  });

  test("preserves tokens that already have tok_ prefix", () => {
    expect(toBearerToken("tok_abc")).toBe("tok_abc");
  });
});

describe("createSessionInjectionScript", () => {
  test("redirects / and /connect to /spaces/new", () => {
    const script = createSessionInjectionScript("tok_test", "http://127.0.0.1:8787");

    expect(script).toContain('localStorage.setItem("murrmure_token"');
    expect(script).toContain('localStorage.setItem("murrmure_hub_url"');
    expect(script).toContain('window.location.pathname === "/" || window.location.pathname === "/connect"');
    expect(script).toContain('window.location.replace("/spaces/new")');
  });

  test("does not redirect to legacy /configure or /setup routes", () => {
    const script = createSessionInjectionScript("tok_test", "http://127.0.0.1:8787");

    expect(script).not.toContain("/configure");
    expect(script).not.toContain("/setup");
    expect(script).not.toContain("murrmure_setup_complete");
  });

  test("embeds serialized token and normalized hub URL", () => {
    const script = createSessionInjectionScript("tok_abc", "http://127.0.0.1:8787/");

    expect(script).toContain('"tok_abc"');
    expect(script).toContain('"http://127.0.0.1:8787"');
    expect(script).not.toContain('"http://127.0.0.1:8787/"');
    expect(script).toContain('document.cookie = "murrmure_token="');
  });
});

describe("ensureBootstrapSession", () => {
  test("returns token and actor_id from whoami", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ actor_id: "actor_bootstrap" }), { status: 200 }),
    );

    const session = await ensureBootstrapSession({
      hubUrl: "http://127.0.0.1:8787",
      bootstrapToken: "01JBOOTSTRAPTOKEN00000001",
      fetchImpl,
    });

    expect(session.token).toBe("tok_01JBOOTSTRAPTOKEN00000001");
    expect(session.actor_id).toBe("actor_bootstrap");
  });
});
