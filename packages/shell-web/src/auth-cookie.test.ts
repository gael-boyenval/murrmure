/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, beforeEach } from "vitest";
import { AUTH_COOKIE_NAME, syncAuthCookie } from "./auth-cookie.js";

describe("syncAuthCookie", () => {
  beforeEach(() => {
    document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  });

  test("sets murrmure_token cookie for iframe view asset auth", () => {
    syncAuthCookie("tok_01JBOOTSTRAPTOKEN00000001");
    expect(document.cookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(document.cookie).toContain("tok_01JBOOTSTRAPTOKEN00000001");
  });

  test("clears cookie when token is empty", () => {
    syncAuthCookie("tok_test");
    syncAuthCookie(null);
    expect(document.cookie).not.toContain("tok_test");
  });
});
