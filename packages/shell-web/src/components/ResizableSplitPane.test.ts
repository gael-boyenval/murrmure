import { describe, expect, test } from "vitest";
import { clampSecondaryWidth } from "./ResizableSplitPane.js";

describe("ResizableSplitPane", () => {
  test("clampSecondaryWidth respects min primary and secondary bounds", () => {
    expect(clampSecondaryWidth(200, 1200)).toBe(280);
    expect(clampSecondaryWidth(900, 1200)).toBe(720);
    expect(clampSecondaryWidth(500, 700)).toBe(374);
  });
});
