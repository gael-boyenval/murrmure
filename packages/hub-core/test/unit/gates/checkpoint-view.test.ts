import { describe, expect, test } from "vitest";
import { resolveCheckpointViewRef } from "../../../src/gates/checkpoint-view.js";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";

describe("gates/checkpoint-view", () => {
  test("resolveCheckpointViewRef reads view_ref from flow IR step", () => {
    const ir = compileFlowIr(
      {
        apiVersion: "murrmure.flow/v1",
        name: "gate-requires-view",
        start: { manual: true },
        steps: [
          {
            id: "review",
            checkpoint: {
              view: "preview-review",
              on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
            },
          },
        ],
      },
      "flw_test",
    );
    ir.steps[0]!.gate!.view_ref = {
      view_id: "preview-review",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
    };

    expect(resolveCheckpointViewRef(ir, "review")).toEqual({
      view_id: "preview-review",
      origin_space_id: "spc_demo",
      entry_url: "./dist/index.html",
    });
    expect(resolveCheckpointViewRef(ir, "missing")).toBeUndefined();
  });
});
