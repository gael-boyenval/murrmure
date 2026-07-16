import { describe, expect, test } from "vitest";
import { canDismissRun } from "./DismissRunButton.js";

describe("DismissRunButton", () => {
  test("canDismissRun accepts active lifecycles only", () => {
    expect(canDismissRun("working")).toBe(true);
    expect(canDismissRun("input-required")).toBe(true);
    expect(canDismissRun("completed")).toBe(false);
    expect(canDismissRun("cancelled")).toBe(false);
    expect(canDismissRun(undefined)).toBe(false);
  });
});
