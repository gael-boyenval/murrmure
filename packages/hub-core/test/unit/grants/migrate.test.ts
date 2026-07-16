import { describe, expect, test } from "vitest";
import {
  canStartFlow,
  canResolveGate,
  mapV1ScopesToCapabilities,
  resolveEffectiveCapabilities,
} from "../../../src/grants/migrate.js";

describe("unit/grants/migrate", () => {
  test("scopes pass through as capabilities when recognized", () => {
    const caps = resolveEffectiveCapabilities({ scopes: ["flow:run", "event:emit"] });
    expect(caps).toContain("flow:run");
    expect(caps).toContain("event:emit");
  });

  test("legacy v1 scope names map to v2 capabilities", () => {
    expect(resolveEffectiveCapabilities({ scopes: ["state:transition"] })).toEqual(["flow:run"]);
    expect(resolveEffectiveCapabilities({ scopes: ["flow:install"] })).toEqual([
      "space:write",
      "flow:read",
    ]);
    expect(resolveEffectiveCapabilities({ scopes: ["event:read"] })).toEqual(["journal:read"]);
    expect(resolveEffectiveCapabilities({ scopes: ["event:emit"] })).toEqual(["event:emit"]);
    expect(resolveEffectiveCapabilities({ scopes: ["federation:emit"] })).toEqual(["event:emit"]);
  });

  test("space:admin expands to admin capability bundle", () => {
    expect(mapV1ScopesToCapabilities(["space:admin"])).toEqual([
      "hub:admin",
      "space:read",
      "space:write",
      "space:enter",
    ]);
  });

  test("explicit capabilities pass through", () => {
    const caps = resolveEffectiveCapabilities({
      scopes: ["space:read"],
      capabilities: ["flow:run"],
    });
    expect(caps).toEqual(["flow:run"]);
  });

  test("conformance: flow:run required to start flow", () => {
    expect(canStartFlow(["space:read"])).toBe(false);
    expect(canStartFlow(["flow:run"])).toBe(true);
    expect(canStartFlow(mapV1ScopesToCapabilities(["state:transition"]))).toBe(true);
  });

  test("conformance: flow:run required to resolve gate / cancel run", () => {
    expect(canResolveGate(["space:read"])).toBe(false);
    expect(canResolveGate(["flow:run"])).toBe(true);
  });
});
