import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button.js";

const meta: Meta<typeof Button> = {
  title: "shell-ui/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "ghost", "secondary", "destructive", "destructive-outline"],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Button", variant: "default" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const Ghost: Story = {
  args: { children: "Ghost", variant: "ghost" },
};

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
};

export const Small: Story = {
  args: { children: "Small", size: "sm" },
};

export const Large: Story = {
  args: { children: "Large", size: "lg" },
};

export const Disabled: Story = {
  args: { children: "Disabled", disabled: true },
};

/** Irreversible run/session actions — solid destructive fill. */
export const Destructive: Story = {
  args: { children: "Cancel run", variant: "destructive" },
};

/** Gate submission in progress — spinner, aria-busy, disabled. */
export const Loading: Story = {
  args: { children: "Approve", loading: true },
};

/** Gate resolve footer — primary Approve + destructive-outline Reject at sm size. */
export const GateFooter: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button size="sm">Approve</Button>
      <Button size="sm" variant="destructive-outline">
        Reject
      </Button>
    </div>
  ),
};
