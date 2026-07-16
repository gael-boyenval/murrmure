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
        {
          id: "decision:build.review",
          step_id: "build.review",
          kind: "decision",
          parent_step_id: "build",
        },
      ],
      edges: [
        { id: "loop->review", source: "step:build.build-loop", target: "step:build.review" },
        {
          id: "decision:build.review->step:build.build-loop:revise:0",
          source: "decision:build.review",
          target: "step:build.build-loop",
          label: "revise",
        },
      ],
      lanes: [],
      step_memos: [],
    };

    const idRemap = new Map([["step:build", "group:build"]]);
    const edges = buildFlowEdges(graph, idRemap);
    const loopEdge = edges.find((edge) => edge.id.includes("revise"));
    const forwardEdge = edges.find((edge) => edge.id === "loop->review");

    expect(loopEdge?.type).toBe("smoothstep");
    expect(loopEdge?.sourceHandle).toBe("bottom-0");
    expect(loopEdge?.targetHandle).toBe("left");
    expect(loopEdge?.style?.strokeDasharray).toBeTruthy();
    expect(forwardEdge?.sourceHandle).toBe("right");
    expect(forwardEdge?.targetHandle).toBe("left");
  });

  test("buildFlowEdges separates failure and success corridors", () => {
    const graph: RunGraphPayload = {
      run_id: "run_1",
      nodes: [
        { id: "decision:intake", step_id: "intake", kind: "decision" },
        { id: "terminal:succeeded", step_id: "run.succeeded", kind: "success_terminal" },
        { id: "terminal:failed", step_id: "run.failed", kind: "failure_terminal" },
      ],
      edges: [
        {
          id: "decision->success",
          source: "decision:intake",
          target: "terminal:succeeded",
          label: "continue",
        },
        {
          id: "decision->fail",
          source: "decision:intake",
          target: "terminal:failed",
          label: "cancel",
          tone: "failure",
        },
      ],
      lanes: [],
      step_memos: [],
    };

    const edges = buildFlowEdges(graph, new Map());
    const success = edges.find((edge) => edge.id === "decision->success");
    const failure = edges.find((edge) => edge.id === "decision->fail");

    expect(success?.sourceHandle).toBe("bottom-0");
    expect(success?.targetHandle).toBe("top");
    expect(failure?.sourceHandle).toBe("bottom-1");
    expect(failure?.targetHandle).toBe("top");
    expect(failure?.markerEnd).toMatchObject({ type: "arrowclosed" });
    expect(failure?.pathOptions?.offset).toBeGreaterThan(success?.pathOptions?.offset ?? 0);
  });

  test("buildFlowEdges stays discrete until a related step is selected or running", () => {
    const graph: RunGraphPayload = {
      run_id: "run_1",
      nodes: [
        { id: "step:intake", step_id: "intake", kind: "step_contract", status: "completed" },
        { id: "step:build", step_id: "build", kind: "step_contract", status: "completed" },
      ],
      edges: [
        { id: "intake->build", source: "step:intake", target: "step:build" },
      ],
      lanes: [],
      step_memos: [],
    };

    const idle = buildFlowEdges(graph, new Map());
    const idleEdge = idle.find((edge) => edge.id === "intake->build");
    expect(idleEdge?.style?.opacity).toBe(0.5);
    expect(idleEdge?.style?.strokeWidth).toBe(1);
    expect(idleEdge?.animated).toBe(false);

    const selected = buildFlowEdges(graph, new Map(), { selectedStepId: "intake" });
    const selectedEdge = selected.find((edge) => edge.id === "intake->build");
    expect(selectedEdge?.style?.opacity).toBe(1);
    expect(selectedEdge?.style?.strokeWidth).toBe(2.5);

    const runningGraph: RunGraphPayload = {
      ...graph,
      nodes: [
        { id: "step:intake", step_id: "intake", kind: "step_contract", status: "completed" },
        { id: "step:build", step_id: "build", kind: "step_contract", status: "working" },
      ],
    };
    const running = buildFlowEdges(runningGraph, new Map());
    const runningEdge = running.find((edge) => edge.id === "intake->build");
    expect(runningEdge?.style?.opacity).toBe(1);
    expect(runningEdge?.style?.strokeWidth).toBe(2.5);
    expect(runningEdge?.animated).toBe(true);
  });
});
