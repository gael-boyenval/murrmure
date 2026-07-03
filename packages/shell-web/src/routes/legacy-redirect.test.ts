import { describe, expect, it } from "vitest";
import { resolveDefaultRoute, resolveHomeFallbackRoute } from "../App.js";

describe("legacy configure redirect", () => {
  it("default route no longer points to configure or setup", () => {
    expect(resolveDefaultRoute(true, true)).not.toBe("/configure");
    expect(resolveDefaultRoute(true, false)).not.toBe("/setup");
    expect(resolveDefaultRoute(true, false)).toBe("/spaces/new");
  });

  it("home fallback never points to configure or setup", () => {
    expect(resolveHomeFallbackRoute(true, true)).toBe("/spaces/new");
    expect(resolveHomeFallbackRoute(false, true)).toBe("/spaces/new");
    expect(resolveHomeFallbackRoute(true, false)).toBe("/spaces/new");
  });
});

