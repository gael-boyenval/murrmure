import { describe, expect, test } from "vitest";
import { deriveSessionStatus } from "../../src/session/status.js";
import type { RunLifecycle } from "@murrmure/contracts";

describe("property/session-status", () => {
  test("active when any run is working or input-required", () => {
    expect(deriveSessionStatus(["working", "completed"])).toBe("active");
    expect(deriveSessionStatus(["input-required", "failed"])).toBe("active");
  });

  test("completed when all runs completed", () => {
    expect(deriveSessionStatus(["completed", "completed"])).toBe("completed");
  });

  test("partial_failure when mix of completed and failed", () => {
    expect(deriveSessionStatus(["completed", "failed"])).toBe("partial_failure");
  });

  test("failed when all terminal failed", () => {
    expect(deriveSessionStatus(["failed", "failed"])).toBe("failed");
  });

  test("cancelled when all cancelled or cancel requested with terminal runs", () => {
    expect(deriveSessionStatus(["cancelled", "cancelled"])).toBe("cancelled");
    expect(deriveSessionStatus(["cancelled", "completed"], true)).toBe("cancelled");
  });

  test("empty runs defaults to active", () => {
    expect(deriveSessionStatus([])).toBe("active");
  });

  const lifecycles: RunLifecycle[] = ["working", "input-required", "completed", "failed", "cancelled"];
  test("derivation is total for single-run cases", () => {
    for (const l of lifecycles) {
      expect(["active", "completed", "partial_failure", "failed", "cancelled"]).toContain(
        deriveSessionStatus([l]),
      );
    }
  });
});
