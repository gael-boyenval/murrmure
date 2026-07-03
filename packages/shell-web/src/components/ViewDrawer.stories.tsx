import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ViewDrawer, type ViewDrawerFlow } from "./ViewDrawer.js";

const reviewParamsFlow: ViewDrawerFlow = {
  flow_id: "flw_review",
  name: "Review loop",
  view_ref: { view_id: "view_review", shell_route: "murrmure/review-params" },
};

const fallbackFlow: ViewDrawerFlow = {
  flow_id: "flw_custom",
  name: "Custom flow",
};

function ViewDrawerDemo({
  flow,
  open: initialOpen = true,
  onSubmit = fn(),
  submitting = false,
}: {
  flow: ViewDrawerFlow;
  open?: boolean;
  onSubmit?: (params: Record<string, unknown>) => void;
  submitting?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <ViewDrawer
      open={open}
      flow={flow}
      spaceId="spc_demo"
      onClose={() => setOpen(false)}
      onSubmit={onSubmit}
      submitting={submitting}
    />
  );
}

const meta: Meta<typeof ViewDrawerDemo> = {
  title: "shell-web/ViewDrawer",
  component: ViewDrawerDemo,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof ViewDrawerDemo>;

export const ReviewParams: Story = {
  args: { flow: reviewParamsFlow, open: true },
};

export const ReviewParamsSubmitting: Story = {
  args: { flow: reviewParamsFlow, open: true, submitting: true },
};

export const FallbackForm: Story = {
  args: {
    flow: fallbackFlow,
    open: true,
    onSubmit: fn(),
  },
};

/** Fallback form with JSON Schema titles and descriptions (CC-05). */
export const FallbackFormWithSchema: Story = {
  render: () => (
    <ViewDrawer
      open
      flow={fallbackFlow}
      spaceId="spc_demo"
      onClose={fn()}
      onSubmit={fn()}
      paramsSchema={{
        type: "object",
        required: ["topic"],
        properties: {
          topic: {
            type: "string",
            title: "Review topic",
            description: "What should this run review?",
          },
          notes: { type: "string", title: "Notes" },
        },
      }}
    />
  ),
};
