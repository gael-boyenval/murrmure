import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import type { RunDetailPayload } from "@murrmure/shell-client";
import { JournalWaterfallView } from "./JournalWaterfallView.js";

const run = {
  run_id: "run_demo",
  session_id: "ses_demo",
  lifecycle: "working",
  journal_replay: [
    { step_id: "plan", status: "completed" },
    { step_id: "draft", status: "completed" },
    { step_id: "review", status: "failed", error: "Agent response failed schema validation." },
  ],
} as RunDetailPayload;

const meta: Meta<typeof JournalWaterfallView> = {
  title: "shell-web/JournalWaterfallView",
  component: JournalWaterfallView,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof JournalWaterfallView>;

export const Default: Story = {
  args: {
    run,
    isLive: true,
    onRetry: fn(),
    journalEntries: [
      { type: "mrmr.step.started", time: "2026-07-01T10:00:00Z", data: {} },
      { type: "mrmr.step.completed", time: "2026-07-01T10:05:00Z", data: {} },
    ],
  },
};

export const Empty: Story = {
  args: {
    run: { run_id: "run_empty", session_id: "ses_empty", lifecycle: "working" },
  },
};

export const PendingGate: Story = {
  args: {
    run: {
      run_id: "run_gate",
      session_id: "ses_gate",
      lifecycle: "input-required",
      journal_replay: [
        { step_id: "plan", status: "completed" },
        { step_id: "review", status: "input-required" },
      ],
    },
    isLive: true,
  },
};

export const FailedWithRetry: Story = {
  args: {
    run: {
      run_id: "run_fail99",
      session_id: "ses_fail99",
      lifecycle: "failed",
      journal_replay: [
        { step_id: "plan", status: "completed" },
        {
          step_id: "invoke:agent",
          status: "failed",
          error: "Upstream timeout after 120s.",
        },
      ],
    } as RunDetailPayload,
    onRetry: fn(),
  },
};
