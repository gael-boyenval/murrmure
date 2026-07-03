import type { Meta, StoryObj } from "@storybook/react";
import type { RunGraphPayload } from "@murrmure/shell-client";
import { RunFlowchartView } from "./RunFlowchartView.js";

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

const meta: Meta<typeof RunFlowchartView> = {
  title: "shell-web/RunFlowchartView",
  component: RunFlowchartView,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Live step graph with human step titles and icon+text status cues inside nodes (CC-08). Gate nodes use blue “Gate” semantics; lanes/steps use done/running/failed/waiting.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof RunFlowchartView>;

export const Default: Story = {
  args: { graph },
};

export const SelectedLane: Story = {
  args: { graph, selectedRunId: "run_B" },
};
