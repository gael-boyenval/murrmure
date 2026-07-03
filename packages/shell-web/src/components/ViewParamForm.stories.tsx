import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ViewParamForm } from "./ViewParamForm.js";

const meta: Meta<typeof ViewParamForm> = {
  title: "shell-web/ViewParamForm",
  component: ViewParamForm,
  tags: ["autodocs"],
  args: { onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof ViewParamForm>;

export const Default: Story = {
  args: {
    form: {
      id: "run.params.v1",
      fields: [
        { name: "topic", type: "string", required: true },
        { name: "depth", type: "enum", values: ["quick", "standard", "deep"] },
      ],
    },
  },
};

export const WithCancel: Story = {
  args: {
    form: {
      id: "run.params.v1",
      fields: [{ name: "topic", type: "string", required: true }],
    },
    onCancel: fn(),
  },
};

export const WithSchemaMetadata: Story = {
  args: {
    form: {
      id: "run.params.v1",
      fields: [
        {
          name: "topic",
          type: "string",
          required: true,
          title: "Review topic",
          description: "What should this run review?",
        },
        { name: "notes", type: "string", required: false },
      ],
    },
  },
};
