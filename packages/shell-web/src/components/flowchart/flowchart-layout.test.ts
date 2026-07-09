import { describe, expect, test } from "vitest";
import { buildFlowEdges, estimateStepNodeHeight } from "./flowchart-layout.js";
import type { RunGraphPayload } from "@murrmure/shell-client";

describe("flowchart-layout", () => {
  test("estimateStepNodeHeight grows with metadata lines", () => {
    const compact = estimateStepNodeHeight({ compact: true, kind: "contract step" });
    const expanded = estimateStepNodeHeight({
      compact: true,
      kind: "contract step",
      metaLines: ["executor · shell", "started · Jul 8", "error · TIMEOUT"],
    });
    expect(expanded).toBeGreaterThan(compact);
  });

  test("buildFlowEdges routes loop backs below nodes", () => {
    const graph: RunGraphPayload = {
      run_id: "run_1",
      nodes: [
        { id: "step:build", step_id: "build", kind: "step_contract", status: "working" },
        {
          id: "step:build.build-loop",
          step_id: "build.build-loop",
          kind: "step_contract",
          status: "working",
          parent_step_id: "build",
        },
        {
          id: "step:build.review",
          step_id: "build.review",
          kind: "step_contract",
          status: "working",
          parent_step_id: "build",
        },
      ],
      edges: [
        { id: "loop->review", source: "step:build.build-loop", target: "step:build.review" },
        { id: "review->loop:loop", source: "step:build.review", target: "step:build.build-loop" },
      ],
      lanes: [],
      step_memos: [],
    };

    const idRemap = new Map([["step:build", "group:build"]]);
    const edges = buildFlowEdges(graph, idRemap);
    const loopEdge = edges.find((edge) => edge.id.includes(":loop"));
    const forwardEdge = edges.find((edge) => edge.id === "loop->review");

    expect(loopEdge?.type).toBe("smoothstep");
    expect(loopEdge?.sourceHandle).toBe("bottom");
    expect(loopEdge?.targetHandle).toBe("bottom");
    expect(forwardEdge?.sourceHandle).toBe("right");
    expect(forwardEdge?.targetHandle).toBe("left");
  });
});
