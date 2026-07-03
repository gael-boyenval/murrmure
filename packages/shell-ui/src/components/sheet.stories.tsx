import type { Meta, StoryObj } from "@storybook/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./sheet.js";
import { Button } from "./button.js";

const meta: Meta<typeof Sheet> = {
  title: "shell-ui/Sheet",
  component: Sheet,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Sheet>;

export const Right: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Open sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Side panel</SheetTitle>
        </SheetHeader>
        <p className="p-6 pt-2 text-sm text-muted-foreground">Sheet content slides in from the right edge.</p>
      </SheetContent>
    </Sheet>
  ),
};

export const Left: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline">Open left sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <p className="p-6 pt-2 text-sm text-muted-foreground">Sheet content slides in from the left edge.</p>
      </SheetContent>
    </Sheet>
  ),
};
