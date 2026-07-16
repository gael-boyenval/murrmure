import { describe, expect, it } from "vitest";
import { mapViewSubmitToGateResolve, mapViewSubmitToResolveStep } from "./view-resolve-adapter.js";

describe("mapViewSubmitToResolveStep", () => {
  it("maps intake submit to continue branch", () => {
    expect(
      mapViewSubmitToResolveStep({ reviewer: "a@b.c", spec_filename: "x.md" }, "submit"),
    ).toEqual({
      branch: "continue",
      payload: { reviewer: "a@b.c", spec_filename: "x.md" },
    });
  });

  it("maps review outcome to branch name", () => {
    expect(mapViewSubmitToResolveStep({ outcome: "validated" }, "submit")).toEqual({
      branch: "validated",
      payload: {},
    });
  });
});

describe("mapViewSubmitToGateResolve", () => {
  it("maps view submit to continue + output", () => {
    expect(mapViewSubmitToGateResolve({ outcome: "validated" }, "submit")).toEqual({
      disposition: "continue",
      output: { outcome: "validated" },
    });
  });

  it("maps request changes as continue (not cancel)", () => {
    expect(
      mapViewSubmitToGateResolve(
        { outcome: "changes_required", comments: [{ text: "Fix header" }] },
        "submit",
      ),
    ).toEqual({
      disposition: "continue",
      output: { outcome: "changes_required", comments: [{ text: "Fix header" }] },
    });
  });

  it("maps cancel to disposition cancel", () => {
    expect(mapViewSubmitToGateResolve({}, "cancel")).toEqual({ disposition: "cancel" });
  });
});
