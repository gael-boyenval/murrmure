import { describe, expect, it } from "vitest";
import { resolveDefaultRoute, resolveHomeFallbackRoute } from "./App.js";

describe("resolveDefaultRoute", () => {
  it("sends non-bundled users without token to connect", () => {
    expect(resolveDefaultRoute(false, false)).toBe("/connect");
  });

  it("sends bundled users with token to home", () => {
    expect(resolveDefaultRoute(true, true)).toBe("/");
  });

  it("sends bundled users without token to spaces/new", () => {
    expect(resolveDefaultRoute(true, false)).toBe("/spaces/new");
  });

  it("sends connected web users to home", () => {
    expect(resolveDefaultRoute(false, true)).toBe("/");
  });
});

describe("resolveHomeFallbackRoute", () => {
  it("sends non-bundled unauthenticated users to connect", () => {
    expect(resolveHomeFallbackRoute(false, false)).toBe("/connect");
  });

  it("sends bundled unauthenticated users to spaces/new", () => {
    expect(resolveHomeFallbackRoute(true, false)).toBe("/spaces/new");
  });

  it("sends authenticated users to spaces/new when no landing space", () => {
    expect(resolveHomeFallbackRoute(false, true)).toBe("/spaces/new");
  });
});
