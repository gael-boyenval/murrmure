import { describe, expect, test } from "vitest";
import { resolveCheckpointViewRef } from "../../../src/gates/checkpoint-view.js";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";

describe("gates/checkpoint-view", () => {
  test("resolveCheckpointViewRef returns undefined for step_contract presentation steps", () => {
    const ir = compileFlowIr(
      {
        apiVersion: "murrmure.flow/v1",
        name: "gate-requires-view",
        start: { manual: true },
        steps: [
          {
            id: "review",
            presentation: { view: "preview-review" },
            branches: {
              continue: { schema: { type: "object" }, next: null },
            },
          },
        ],
      },
      "flw_test",
    );

    expect(resolveCheckpointViewRef(ir, "review")).toBeUndefined();
    expect(resolveCheckpointViewRef(ir, "missing")).toBeUndefined();
  });
});
