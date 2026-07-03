import type { Meta, StoryObj } from "@storybook/react";
import { ProfileMenu } from "./ProfileMenu.js";
import { withShellWebProviders } from "../stories/with-providers.js";

const meta: Meta<typeof ProfileMenu> = {
  title: "shell-web/ProfileMenu",
  component: ProfileMenu,
  tags: ["autodocs"],
  decorators: [withShellWebProviders],
};

export default meta;
type Story = StoryObj<typeof ProfileMenu>;

export const Default: Story = {};
