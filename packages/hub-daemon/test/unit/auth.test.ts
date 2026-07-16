import { describe, expect, test } from "vitest";
import { parseBearer, parseCookieToken, parseSessionToken } from "../../src/auth.js";

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

  test("returns undefined when cookie missing", () => {
    const req = new Request("http://127.0.0.1/v1/test");
    expect(parseCookieToken(req)).toBeUndefined();
  });
});
