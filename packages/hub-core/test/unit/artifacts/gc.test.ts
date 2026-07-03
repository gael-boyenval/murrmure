import { describe, expect, test } from "vitest";
import { selectArtifactsForGc } from "../../../src/artifacts/gc-command.js";

describe("artifacts/gc-command", () => {
  test("skips held artifacts even when expired", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const result = selectArtifactsForGc(
      [
        {
          transfer_id: "xfr_01JHELD0000000000000001",
          source_space_id: "space_a",
          hold: true,
          expires_at: past,
        },
        {
          transfer_id: "xfr_01JEXP000000000000000001",
          source_space_id: "space_a",
          hold: false,
          expires_at: past,
        },
      ],
    );

    expect(result.skipped_held).toEqual(["xfr_01JHELD0000000000000001"]);
    expect(result.eligible.map((row) => row.transfer_id)).toEqual(["xfr_01JEXP000000000000000001"]);
  });

  test("ignores artifacts that have not expired", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const result = selectArtifactsForGc([
      {
        transfer_id: "xfr_01JACTIVE000000000000001",
        source_space_id: "space_a",
        hold: false,
        expires_at: future,
      },
    ]);

    expect(result.eligible).toEqual([]);
    expect(result.skipped_held).toEqual([]);
  });
});
