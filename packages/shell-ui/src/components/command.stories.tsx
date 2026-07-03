import type { Meta, StoryObj } from "@storybook/react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./command.js";

const meta: Meta<typeof Command> = {
  title: "shell-ui/Command",
  component: Command,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Command>;

export const Default: Story = {
  render: () => (
    <Command className="max-w-md">
      <CommandInput />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          <CommandItem>Daily brief</CommandItem>
          <CommandItem>Review loop</CommandItem>
          <CommandItem>Feature spec</CommandItem>
        </CommandGroup>
        <CommandGroup>
          <CommandItem value="Platform">Platform</CommandItem>
          <CommandItem value="Design system">Design system</CommandItem>
        </CommandGroup>
        <CommandGroup>
          <CommandItem value="Review loop · Platform">Review loop · Platform</CommandItem>
          <CommandItem value="Daily brief · Design system">Daily brief · Design system</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
