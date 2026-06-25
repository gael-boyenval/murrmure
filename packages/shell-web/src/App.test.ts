import { describe, expect, it } from "vitest";
import { resolveDefaultRoute } from "./App.js";

describe("resolveDefaultRoute", () => {
  it("prefers configure once setup is complete", () => {
    expect(resolveDefaultRoute(true, false, false)).toBe("/configure");
    expect(resolveDefaultRoute(true, true, true)).toBe("/configure");
  });

  it("skips connect in bundled mode when token exists", () => {
    expect(resolveDefaultRoute(false, true, true)).toBe("/setup");
  });

  it("falls back to connect for non-bundled or missing token", () => {
    expect(resolveDefaultRoute(false, false, true)).toBe("/connect");
    expect(resolveDefaultRoute(false, true, false)).toBe("/connect");
  });
});
