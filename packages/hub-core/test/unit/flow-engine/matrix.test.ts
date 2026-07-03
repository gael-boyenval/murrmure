import { describe, expect, test } from "vitest";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import {
  matrixLaneIdempotencyKey,
  planMatrixExpansion,
  laneExecContext,
} from "../../../src/flow-engine/matrix.js";
import type { FlowManifest } from "@murrmure/contracts";

const parallelManifest: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "parallel-dev",
  start: { manual: true },
  steps: [
    {
      id: "parallel_dev",
      parallel: {
        matrix: "{{input.worktrees}}",
        lane: [
          {
            id: "dev",
            invoke: { space: "{{item.space}}", action: "implement" },
          },
        ],
      },
    },
  ],
};

describe("flow-engine/matrix", () => {
  test("creates N lane plans from resolved matrix", () => {
    const ir = compileFlowIr(parallelManifest, "flw_parallel_dev");
    const plans = planMatrixExpansion(ir, "parallel_dev", "run_PARENT", {
      input: {
        worktrees: [{ space: "spc_a" }, { space: "spc_b" }],
      },
    });
    expect(plans).toHaveLength(2);
    expect(plans![0]!.idempotency_key).toBe(matrixLaneIdempotencyKey("run_PARENT", "parallel_dev", 0));
    expect(plans![1]!.idempotency_key).toBe(matrixLaneIdempotencyKey("run_PARENT", "parallel_dev", 1));
    expect(plans![0]!.lane_steps).toHaveLength(1);
  });

  test("returns null when matrix unresolved", () => {
    const ir = compileFlowIr(parallelManifest, "flw_parallel_dev");
    expect(planMatrixExpansion(ir, "parallel_dev", "run_PARENT", { input: {} })).toBeNull();
  });

  test("lane exec context carries item and parent refs", () => {
    const ctx = laneExecContext({ input: {} }, { space: "spc_a" }, 0, "run_PARENT", "parallel_dev");
    expect(ctx.item).toEqual({ space: "spc_a" });
    expect(ctx._matrix_index).toBe(0);
    expect(ctx._parent_run_id).toBe("run_PARENT");
  });
});
