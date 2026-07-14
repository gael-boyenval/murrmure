import { describe, expect, test } from "vitest";
import { resolveCheckpointViewRef } from "../../../src/gates/checkpoint-view.js";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";

describe("gates/checkpoint-view", () => {
  test("resolveCheckpointViewRef returns undefined for step_contract steps (no gate)", () => {
    const ir = compileFlowIr(
      {
        apiVersion: "murrmure.flow/v1",
        name: "gate-requires-view",
        triggers: { manual: true },
        steps: [
          {
            id: "review",
            description: "review",
            branches: {
              continue: { schema: { type: "object" }, route: { run: "completed" } },
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
