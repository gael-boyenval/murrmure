/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RunFlowchartView } from "./RunFlowchartView.js";
import type { RunGraphPayload } from "@murrmure/shell-client";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
});

const graph: RunGraphPayload = {
  run_id: "run_PARENT",
  flow_id: "flw_parallel",
  nodes: [
    { id: "fork:parallel_dev", step_id: "parallel_dev", kind: "fork", status: "working" },
    { id: "lane:parallel_dev:0", step_id: "parallel_dev", kind: "lane", run_id: "run_A" },
    { id: "lane:parallel_dev:1", step_id: "parallel_dev", kind: "lane", run_id: "run_B" },
    { id: "join:parallel_dev", step_id: "parallel_dev", kind: "join", status: "working" },
  ],
  edges: [
    { id: "fork->lane0", source: "fork:parallel_dev", target: "lane:parallel_dev:0" },
    { id: "fork->lane1", source: "fork:parallel_dev", target: "lane:parallel_dev:1" },
  ],
  lanes: [
    { step_id: "parallel_dev", matrix_index: 0, run_id: "run_A", lifecycle: "completed", label: "lane-a" },
    { step_id: "parallel_dev", matrix_index: 1, run_id: "run_B", lifecycle: "failed", label: "lane-b" },
  ],
  step_memos: [],
};

describe("RunFlowchartView partial failure", () => {
  test("renders fork/join lanes with lifecycle colors", () => {
    render(<RunFlowchartView graph={graph} selectedRunId="run_B" />);
    expect(screen.getByText("lane-a")).toBeTruthy();
    expect(screen.getByText("lane-b")).toBeTruthy();
  });
});

describe("RunFlowchartView nested steps", () => {
  test("renders child step labels inside parent group", () => {
    const nestedGraph: RunGraphPayload = {
      run_id: "run_1",
      flow_id: "flw_nested",
      nodes: [
        { id: "step:build", step_id: "build", kind: "step_contract", status: "working" },
        {
          id: "step:build.build-loop",
          step_id: "build.build-loop",
          kind: "step_contract",
          status: "completed",
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
        { id: "build->loop", source: "step:build", target: "step:build.build-loop" },
        { id: "loop->review", source: "step:build.build-loop", target: "step:build.review" },
        { id: "review->loop:loop", source: "step:build.review", target: "step:build.build-loop" },
      ],
      lanes: [],
      step_memos: [
        {
          step_id: "build.build-loop",
          status: "completed",
          started_at: "2026-07-08T12:00:00.000Z",
          executor_type: "shell",
        },
        {
          step_id: "build.review",
          status: "working",
          started_at: "2026-07-08T12:01:00.000Z",
        },
      ] as RunGraphPayload["step_memos"],
    };

    render(<RunFlowchartView graph={nestedGraph} selectedStepId="build.review" />);
    expect(screen.getByText("build-loop ×1")).toBeTruthy();
    expect(screen.getByText("review")).toBeTruthy();
    expect(screen.getByText(/executor · shell/i)).toBeTruthy();
    expect(screen.getAllByText(/started ·/i).length).toBeGreaterThanOrEqual(2);
  });

  test("shows loop iteration count from exec context", () => {
    const nestedGraph: RunGraphPayload = {
      run_id: "run_1",
      flow_id: "flw_nested",
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
          status: "completed",
          parent_step_id: "build",
        },
      ],
      edges: [
        { id: "build->loop", source: "step:build", target: "step:build.build-loop" },
        { id: "loop->review", source: "step:build.build-loop", target: "step:build.review" },
        { id: "review->loop:loop", source: "step:build.review", target: "step:build.build-loop" },
      ],
      lanes: [],
      step_memos: [],
    };

    render(
      <RunFlowchartView
        graph={nestedGraph}
        execContext={{
          steps: {
            "build.build-loop": { output: { preview_url: "http://x", iteration: 3 } },
          },
        }}
      />,
    );
    expect(screen.getByText("build-loop ×3")).toBeTruthy();
  });

  test("selects parent step when group header is clicked", () => {
    const nestedGraph: RunGraphPayload = {
      run_id: "run_1",
      flow_id: "flw_nested",
      nodes: [
        { id: "step:build", step_id: "build", kind: "step_contract", status: "working" },
        {
          id: "step:build.build-loop",
          step_id: "build.build-loop",
          kind: "step_contract",
          status: "working",
          parent_step_id: "build",
        },
      ],
      edges: [{ id: "build->loop", source: "step:build", target: "step:build.build-loop" }],
      lanes: [],
      step_memos: [],
    };
    const onSelectStep = vi.fn();

    render(<RunFlowchartView graph={nestedGraph} onSelectStep={onSelectStep} />);
    fireEvent.click(screen.getByTestId("rf__node-group:build"));
    expect(onSelectStep).toHaveBeenCalledWith("build");
  });
});
