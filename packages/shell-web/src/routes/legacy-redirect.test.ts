import { describe, expect, it } from "vitest";
import { resolveDefaultRoute } from "../App.js";

describe("legacy configure redirect", () => {
  it("default route no longer points to configure", () => {
    expect(resolveDefaultRoute(true, true)).not.toBe("/configure");
    expect(resolveDefaultRoute(true, false)).not.toBe("/setup");
  });
});
