import { describe, expect, test } from "vitest";
import { displaySessionStatus, sessionStatusBadgeProps } from "./session-status-badge.js";

describe("sessionStatusBadgeProps", () => {
  test("partial_failure uses warning variant", () => {
    expect(sessionStatusBadgeProps("partial_failure")).toEqual({
      variant: "warning",
      label: "Partial failure",
    });
  });
});

describe("displaySessionStatus", () => {
  test("shows partial_failure when a run failed while others are active", () => {
    expect(displaySessionStatus("active", ["completed", "failed", "waiting"])).toBe("partial_failure");
  });

  test("preserves completed when no failures", () => {
    expect(displaySessionStatus("completed", ["completed", "completed"])).toBe("completed");
  });
});
