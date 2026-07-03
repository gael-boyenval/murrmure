import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { GateItem } from "@murrmure/shell-client";
import { withShellWebProviders } from "../stories/with-providers.js";
import { GateResolvePanel } from "./GateResolvePanel.js";

const gate: GateItem = {
  gate_id: "chk_test",
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

const meta: Meta<typeof GateResolvePanel> = {
  title: "shell-web/GateResolvePanel",
  component: GateResolvePanel,
  tags: ["autodocs"],
  decorators: [withShellWebProviders],
  args: { onSubmit: fn().mockResolvedValue(undefined) },
};

export default meta;
type Story = StoryObj<typeof GateResolvePanel>;

export const Default: Story = {
  args: { gate },
};

export const Submitting: Story = {
  args: { gate, submitting: true },
};

export const HighStakesApprove: Story = {
  args: {
    gate,
    approveConsequence:
      "Approving binds this orchestration to the session and enqueues the proposed steps.",
  },
};

const hiddenSpaceGate: GateItem = {
  ...gate,
  gate_id: "chk_hidden",
  space_hidden: true,
  space_label: "Private space",
  space_link: undefined,
  title: "Approval needed: sensitive action",
  summary: "Run blocked in a private space until you approve or reject.",
};

export const HiddenSpace: Story = {
  args: { gate: hiddenSpaceGate },
};
