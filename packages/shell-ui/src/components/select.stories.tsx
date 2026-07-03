import type { Meta, StoryObj } from "@storybook/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js";
import { Label } from "./label.js";

const meta: Meta<typeof Select> = {
  title: "shell-ui/Select",
  component: Select,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-2">
      <Label htmlFor="depth">Depth</Label>
      <Select defaultValue="standard">
        <SelectTrigger id="depth">
          <SelectValue placeholder="Select depth" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="quick">quick</SelectItem>
          <SelectItem value="standard">standard</SelectItem>
          <SelectItem value="deep">deep</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

export const Compact: Story = {
  render: () => (
    <Select defaultValue="demo-space">
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue placeholder="Landing space…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="demo-space">Demo space</SelectItem>
        <SelectItem value="other">Other space</SelectItem>
      </SelectContent>
    </Select>
  ),
};
