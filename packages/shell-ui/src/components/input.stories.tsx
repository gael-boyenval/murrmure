import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input.js";
import { Label } from "./label.js";

const meta: Meta<typeof Input> = {
  title: "shell-ui/Input",
  component: Input,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  render: (args) => (
    <div className="w-full max-w-sm">
      <Input {...args} />
    </div>
  ),
  args: { placeholder: "Enter text…" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="you@example.com" />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="w-full max-w-sm">
      <Input {...args} />
    </div>
  ),
  args: { placeholder: "Disabled", disabled: true, value: "Read only" },
};
