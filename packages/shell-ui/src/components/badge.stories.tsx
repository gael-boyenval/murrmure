import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge.js";

const meta: Meta<typeof Badge> = {
  title: "shell-ui/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "success", "warning", "running", "failed", "gate"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "Badge", variant: "default" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const Success: Story = {
  args: { children: "Completed", variant: "success" },
};

/** Passive wait — amber + clock icon; not actionable. */
export const Warning: Story = {
  args: { children: "Pending", variant: "warning" },
};

export const Running: Story = {
  args: { children: "Running", variant: "running" },
};

export const Failed: Story = {
  args: { children: "Failed", variant: "failed" },
};

/** Human action required — blue + hand icon; distinct from passive pending. */
export const Gate: Story = {
  args: { children: "Awaiting approval", variant: "gate" },
};
