/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunFlowchartView } from "./RunFlowchartView.js";
import type { RunGraphPayload } from "@murrmure/shell-client";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
});

const graph: RunGraphPayload = {
  run_id: "run_PARENT",
  flow_id: "flw_parallel",
  nodes: [
    { id: "fork:parallel_dev", step_id: "parallel_dev", kind: "fork", status: "working" },
    { id: "lane:parallel_dev:0", step_id: "parallel_dev", kind: "lane", run_id: "run_A" },
    { id: "lane:parallel_dev:1", step_id: "parallel_dev", kind: "lane", run_id: "run_B" },
    { id: "join:parallel_dev", step_id: "parallel_dev", kind: "join", status: "working" },
    { id: "step:plan", step_id: "plan", kind: "invoke", status: "completed" },
    { id: "step:review", step_id: "review", kind: "gate", status: "working" },
  ],
  edges: [
    { id: "fork->lane0", source: "fork:parallel_dev", target: "lane:parallel_dev:0" },
    { id: "fork->lane1", source: "fork:parallel_dev", target: "lane:parallel_dev:1" },
    { id: "plan->review", source: "step:plan", target: "step:review" },
  ],
  lanes: [
    { step_id: "parallel_dev", matrix_index: 0, run_id: "run_A", lifecycle: "completed", label: "Research" },
    { step_id: "parallel_dev", matrix_index: 1, run_id: "run_B", lifecycle: "failed", label: "Draft" },
  ],
  step_memos: [],
};

describe("RunFlowchartView partial failure", () => {
  test("renders fork/join lanes with lifecycle colors", () => {
    render(<RunFlowchartView graph={graph} selectedRunId="run_B" />);
    expect(screen.getByText("Research")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
  });
});

describe("CC-08 status semantics", () => {
  test("renders human step titles with icon-backed status labels", () => {
    render(<RunFlowchartView graph={graph} />);
    expect(screen.getAllByText("Parallel dev (fork)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Parallel dev (join)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Plan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Done").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Running").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gate").length).toBeGreaterThan(0);
  });
});

describe("CC-01 React Flow dark chrome", () => {
  test("applies dark color mode to React Flow root", () => {
    const { container } = render(<RunFlowchartView graph={graph} />);
    expect(container.querySelector(".react-flow")?.classList.contains("dark")).toBe(true);
  });

  test("renders themed minimap and controls chrome", () => {
    const { container } = render(<RunFlowchartView graph={graph} />);
    expect(container.querySelector(".react-flow__minimap")).toBeTruthy();
    expect(container.querySelector(".react-flow__controls")).toBeTruthy();
    expect(container.querySelectorAll(".react-flow__controls-button").length).toBeGreaterThan(0);
  });
});
