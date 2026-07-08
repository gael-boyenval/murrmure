import { describe, expect, test } from "vitest";
import { mapViewSubmitToResolveStep } from "../src/app/resolve-step.js";

describe("mapViewSubmitToResolveStep", () => {
  test("maps submit to continue branch", () => {
    expect(mapViewSubmitToResolveStep({ topic: "ai" }, "submit")).toEqual({
      branch: "continue",
      payload: { topic: "ai" },
    });
  });

  test("maps outcome field to branch name", () => {
    expect(mapViewSubmitToResolveStep({ outcome: "validated", notes: "ok" }, "submit")).toEqual({
      branch: "validated",
      payload: { notes: "ok" },
    });
  });

  test("maps cancel to cancel branch", () => {
    expect(mapViewSubmitToResolveStep({}, "cancel")).toEqual({ branch: "cancel" });
  });

  test("maps artifacts_out on submit", () => {
    expect(
      mapViewSubmitToResolveStep({ reviewer: "a@b" }, "submit", [{ slot: "spec", path: "hero.md" }]),
    ).toEqual({
      branch: "continue",
      payload: { reviewer: "a@b" },
      artifacts_out: [{ slot: "spec", path: "hero.md" }],
    });
  });
});
