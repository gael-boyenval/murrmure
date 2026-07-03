import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { ReviewParamsView } from "./ReviewParamsView.js";

const meta: Meta<typeof ReviewParamsView> = {
  title: "shell-web/ReviewParamsView",
  component: ReviewParamsView,
  tags: ["autodocs"],
  args: { onSubmit: fn() },
};

export default meta;
type Story = StoryObj<typeof ReviewParamsView>;

export const Default: Story = {};

export const WithCancel: Story = {
  args: { onCancel: fn() },
};
