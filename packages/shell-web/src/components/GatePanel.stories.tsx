import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { GateItem } from "@murrmure/shell-client";
import { withShellWebProviders } from "../stories/with-providers.js";
import { GatePanel } from "./GatePanel.js";

const reviewGate: GateItem = {
  gate_id: "chk_review",
  run_id: "run_c1d4e5",
  session_id: "ses_review_loop",
  step_id: "gate:review",
  status: "pending",
  title: "Review loop — human approval needed",
  summary: "Agent completed draft, waiting for your decision.",
  created_at: "2026-07-01T09:30:00Z",
  space_label: "Demo space",
  space_link: "/spaces/spc_demo",
  form: {
    id: "review.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string", required: false },
    ],
  },
};

const orchestrationGate: GateItem = {
  gate_id: "gate_orch",
  run_id: "run_orch_new",
  session_id: "ses_orch_new",
  step_id: "orchestration:proposed",
  status: "pending",
  title: "Validate proposed orchestration",
  summary: "Agent proposed a new multi-step pipeline.",
  created_at: "2026-07-01T07:50:00Z",
  space_label: "Demo space",
  space_link: "/spaces/spc_demo",
  form: {
    id: "orchestration.validate.v1",
    fields: [
      { name: "decision", type: "enum", values: ["approve", "reject"] },
      { name: "notes", type: "string", required: false },
    ],
  },
  orchestration_preview: {
    manifest_name: "agent-proposed",
    flow_digest: "sha256:preview",
    steps: [
      {
        step_id: "plan",
        space: "spc_demo",
        action: "plan",
        param_shape: { api_key: "string", count: "number" },
      },
    ],
  },
};

const meta: Meta<typeof GatePanel> = {
  title: "shell-web/GatePanel",
  component: GatePanel,
  tags: ["autodocs"],
  decorators: [withShellWebProviders],
  args: { onSubmit: fn().mockResolvedValue(undefined) },
};

export default meta;
type Story = StoryObj<typeof GatePanel>;

export const ReviewGate: Story = {
  args: { gate: reviewGate },
};

export const OrchestrationGate: Story = {
  args: { gate: orchestrationGate },
};

export const ReviewGateSubmitting: Story = {
  args: { gate: reviewGate, submitting: true },
};

export const OrchestrationGateSubmitting: Story = {
  args: { gate: orchestrationGate, submitting: true },
};
