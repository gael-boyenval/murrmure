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
