import { useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { NotificationBell } from "./NotificationBell.js";
import { ShellClientContext } from "../providers/ShellClientProvider.js";
import { createMockShellClient } from "../stories/mock-shell-client.js";
import { withShellWebProviders } from "../stories/with-providers.js";

const meta: Meta<typeof NotificationBell> = {
  title: "shell-web/NotificationBell",
  component: NotificationBell,
  tags: ["autodocs"],
  decorators: [withShellWebProviders],
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        component:
          "Header inbox entry. Link `aria-label` includes pending count (e.g. “Needs you, 3 pending”); count changes are mirrored in an `aria-live=\"polite\"` region.",
      },
    },
  },
};

export const ZeroPending: Story = {
  decorators: [
    (Story) => {
      const client = useMemo(() => createMockShellClient([]), []);
      return (
        <ShellClientContext.Provider value={client}>
          <Story />
        </ShellClientContext.Provider>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        story: "Empty inbox — bell + “Needs you” label with no count badge (`pending_count: 0`).",
      },
    },
  },
};
