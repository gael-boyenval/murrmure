import { describe, expect, test } from "vitest";
import desktopConfig from "../electrobun.config.js";

describe("Tutorial v3 packaged Desktop conformance", () => {
  test("Task 01 — packaged Desktop boots with no seeded spaces", () => {
    const copy = desktopConfig.build?.copy ?? {};
    expect(Object.keys(copy)).not.toContain("../../fixtures/hub/contracts");
    expect(Object.values(copy)).not.toContain("Resources/hub/contracts");
  });
  test.skip("Task 02 — stable launcher discovers the relocated bundled bridge", () => {});
  test.skip("Task 14 — Parts 1–6 execute through packaged Desktop", () => {});
});

