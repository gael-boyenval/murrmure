import { describe, expect, it } from "vitest";
import { mapViewSubmitToGateResolve } from "./view-resolve-adapter.js";

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
