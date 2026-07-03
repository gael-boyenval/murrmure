import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./checkbox.js";
import { Label } from "./label.js";

const meta: Meta<typeof Checkbox> = {
  title: "shell-ui/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" defaultChecked />
      <Label htmlFor="terms">Accept terms</Label>
    </div>
  ),
};

export const Unchecked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="opt-out" />
      <Label htmlFor="opt-out">Opt out</Label>
    </div>
  ),
};
