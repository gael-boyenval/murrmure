import type { Meta, StoryObj } from "@storybook/react";
import { withShellWebProviders } from "./with-providers.js";
import { SpaceHomePrototype } from "./pages/SpaceHomePrototype.js";
import { SpaceHomeWithDrawerPrototype } from "./pages/SpaceHomeWithDrawerPrototype.js";
import { RunPagePrototype } from "./pages/RunPagePrototype.js";
import { SessionPagePrototype } from "./pages/SessionPagePrototype.js";
import { NotificationsPrototype } from "./pages/NotificationsPrototype.js";
import { ConnectPrototype } from "./pages/ConnectPrototype.js";
import { FlowPreviewPrototype } from "./pages/FlowPreviewPrototype.js";

const meta: Meta = {
  title: "prototypes/Pages",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withShellWebProviders],
};

export default meta;
type Story = StoryObj;

export const SpaceHomeEmpty: Story = {
  name: "Space home — empty",
  render: () => <SpaceHomePrototype state="empty" />,
};

export const SpaceHomeActive: Story = {
  name: "Space home — active",
  render: () => <SpaceHomePrototype state="active" />,
};

export const SpaceHomeNeedsAttention: Story = {
  name: "Space home — needs attention",
  render: () => <SpaceHomePrototype state="attention" />,
};

export const SpaceHomeRunDrawer: Story = {
  name: "Space home — run drawer open",
  render: () => <SpaceHomeWithDrawerPrototype />,
};

export const RunWorking: Story = {
  name: "Run — in progress",
  render: () => <RunPagePrototype state="working" />,
};

export const RunPendingGate: Story = {
  name: "Run — pending review gate",
  render: () => <RunPagePrototype state="pending-gate" />,
};

export const RunOrchestrationGate: Story = {
  name: "Run — orchestration validation",
  render: () => <RunPagePrototype state="orchestration-gate" />,
};

export const RunFailed: Story = {
  name: "Run — failed with retry",
  render: () => <RunPagePrototype state="failed" />,
};

export const SessionWorking: Story = {
  name: "Session — active run",
  render: () => <SessionPagePrototype state="working" />,
};

export const SessionGateOpen: Story = {
  name: "Session — gate panel open",
  render: () => <SessionPagePrototype state="gate-open" />,
};

export const SessionFailed: Story = {
  name: "Session — failed lane",
  render: () => <SessionPagePrototype state="failed" />,
};

export const NotificationsEmpty: Story = {
  name: "Notifications — empty inbox",
  render: () => <NotificationsPrototype state="empty" />,
};

export const NotificationsInbox: Story = {
  name: "Notifications — pending items",
  render: () => <NotificationsPrototype state="inbox" />,
};

export const NotificationsResolvingGate: Story = {
  name: "Notifications — resolving gate",
  render: () => <NotificationsPrototype state="resolving-gate" />,
};

export const Connect: Story = {
  name: "Connect — agent setup",
  render: () => <ConnectPrototype />,
};

export const FlowPreview: Story = {
  name: "Flow preview — step list",
  render: () => <FlowPreviewPrototype />,
};
