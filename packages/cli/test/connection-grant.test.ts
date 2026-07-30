import { describe, expect, test } from "vitest";
import {
  CUSTOM_CONNECTION_PROFILE,
  GRANTABLE_CAPABILITIES,
  isLocalToolsCapabilitySet,
  parseGrantableCapabilities,
} from "../src/wizard/capabilities.js";

describe("parseGrantableCapabilities", () => {
  test("parses and dedupes a comma list", () => {
    expect(parseGrantableCapabilities("space:read, event:emit, space:read")).toEqual([
      "space:read",
      "event:emit",
    ]);
  });

  test("returns empty for blank input", () => {
    expect(parseGrantableCapabilities(undefined)).toEqual([]);
    expect(parseGrantableCapabilities("  ")).toEqual([]);
  });

  test("rejects unknown capabilities", () => {
    expect(() => parseGrantableCapabilities("space:read,action:invoke")).toThrow(
      /Unknown capabilities: action:invoke/,
    );
  });

  test("exposes the full grantable set", () => {
    expect(GRANTABLE_CAPABILITIES).toContain("event:emit");
    expect(GRANTABLE_CAPABILITIES).toContain("hub:admin");
  });
});

describe("isLocalToolsCapabilitySet", () => {
  test("matches the fixed local-tools set only", () => {
    expect(
      isLocalToolsCapabilitySet(["space:read", "flow:read", "flow:run", "step:resolve"]),
    ).toBe(true);
    expect(
      isLocalToolsCapabilitySet([
        "space:read",
        "flow:read",
        "flow:run",
        "step:resolve",
        "event:emit",
      ]),
    ).toBe(false);
    expect(CUSTOM_CONNECTION_PROFILE).toBe("custom");
  });
});
