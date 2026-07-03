import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { GateItem } from "@murrmure/shell-client";
import { withShellWebProviders } from "../stories/with-providers.js";
import { OrchestrationValidateGate } from "./OrchestrationValidateGate.js";

const gate: GateItem = {
  gate_id: "gate_orch",
  run_id: "run_orch",
  session_id: "ses_orch",
  step_id: "orchestration:proposed",
  status: "pending",
  title: "Validate proposed orchestration",
  summary: "Agent proposed pipeline “agent-proposed”.",
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
        expect: "plan artifact",
      },
      { step_id: "review", action: "gate" },
    ],
  },
};

const meta: Meta<typeof OrchestrationValidateGate> = {
  title: "shell-web/OrchestrationValidateGate",
  component: OrchestrationValidateGate,
  tags: ["autodocs"],
  decorators: [withShellWebProviders],
  args: { onSubmit: fn().mockResolvedValue(undefined) },
};

export default meta;
type Story = StoryObj<typeof OrchestrationValidateGate>;

export const Default: Story = {
  args: { gate },
};
