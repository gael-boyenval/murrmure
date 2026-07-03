import type { Meta, StoryObj } from "@storybook/react";
import { ChevronRight } from "lucide-react";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card.js";

const meta: Meta<typeof Card> = {
  title: "shell-ui/Card",
  component: Card,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Supporting description for the card content.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button size="sm">Action</Button>
        <Button size="sm" variant="outline">
          Cancel
        </Button>
      </CardContent>
    </Card>
  ),
};

/** Read-only run summary — click-through with status badge, no inline mutation. */
export const RunCard: Story = {
  render: () => (
    <Card className="w-[380px] cursor-pointer transition-colors hover:bg-muted/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-base">Parallel code review</CardTitle>
              <Badge variant="running">Running</Badge>
            </div>
            <CardDescription className="text-foreground/70">
              Demo space · Updated 2m ago
            </CardDescription>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="truncate font-mono text-xs text-muted-foreground">run_c1d4e5</p>
      </CardContent>
    </Card>
  ),
};

/** Gate awaiting human action — amber emphasis border and resolve footer. */
export const GateCard: Story = {
  render: () => (
    <Card className="w-[380px] border-amber-800/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="gate">Awaiting approval</Badge>
          <span className="text-xs text-muted-foreground">Pending 12m</span>
        </div>
        <CardTitle className="text-base">Review loop — human approval needed</CardTitle>
        <CardDescription className="text-foreground/70">
          Agent completed draft; approve to resume the run at step <span className="font-mono">review</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-border pt-4">
        <div className="flex gap-2">
          <Button size="sm">Approve</Button>
          <Button size="sm" variant="destructive-outline">
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
};
