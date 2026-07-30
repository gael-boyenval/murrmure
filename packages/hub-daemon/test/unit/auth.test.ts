import { describe, expect, test } from "vitest";
import {
  parseAccessTokenQuery,
  parseBearer,
  parseCookieToken,
  parseSessionToken,
  viewAssetAuthCookieHeader,
} from "../../src/auth.js";

describe("parseCookieToken", () => {
  test("reads murrmure_token from Cookie header", () => {
    const req = new Request("http://127.0.0.1/v1/spaces/spc_a/views/v/dist/index.html", {
      headers: { Cookie: "murrmure_token=tok_01JBOOTSTRAPTOKEN00000001" },
    });
    expect(parseCookieToken(req)).toBe("tok_01JBOOTSTRAPTOKEN00000001");
  });

  test("prefers Bearer over cookie when both present", () => {
    const req = new Request("http://127.0.0.1/v1/test", {
      headers: {
        Authorization: "Bearer tok_bearer",
        Cookie: "murrmure_token=tok_cookie",
      },
    });
    expect(parseSessionToken(req)).toBe("tok_bearer");
    expect(parseBearer(req)).toBe("tok_bearer");
  });

  test("reads access_token query for iframe view assets", () => {
    const req = new Request(
      "http://127.0.0.1/v1/spaces/spc_a/views/v/dist/index.html?access_token=tok_query",
    );
    expect(parseAccessTokenQuery(req)).toBe("tok_query");
    expect(parseSessionToken(req)).toBe("tok_query");
  });

  test("viewAssetAuthCookieHeader uses SameSite=None for opaque iframes", () => {
    expect(viewAssetAuthCookieHeader("tok_abc")).toContain("SameSite=None");
    expect(viewAssetAuthCookieHeader("tok_abc")).toContain("Secure");
  });

  test("returns undefined when cookie missing", () => {
    const req = new Request("http://127.0.0.1/v1/test");
    expect(parseCookieToken(req)).toBeUndefined();
  });
});
