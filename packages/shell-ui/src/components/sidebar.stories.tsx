import type { Meta, StoryObj } from "@storybook/react";
import { Plus } from "lucide-react";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarNavItem,
} from "./sidebar.js";

/** Static fixtures mirroring AppShell / philosophy sidebar IA (CC-10). */
export interface SidebarSpaceFixture {
  id: string;
  name: string;
  active?: boolean;
  /** Pending gate count for this space — shown as warning badge. */
  pendingGateCount?: number;
}

export interface SidebarSessionFixture {
  id: string;
  title: string;
  active?: boolean;
  status?: "working" | "partial_failure" | "gate";
}

export const POPULATED_SPACES: SidebarSpaceFixture[] = [
  { id: "spc_demo", name: "Demo space", active: true },
  { id: "spc_frontend", name: "frontend", pendingGateCount: 2 },
  { id: "spc_api", name: "api-space" },
];

export const POPULATED_SESSIONS: SidebarSessionFixture[] = [
  { id: "ses_feat", title: "Feature delivery", status: "gate" },
  { id: "ses_review", title: "Review loop", active: true },
  { id: "ses_matrix", title: "Matrix smoke", status: "partial_failure" },
];

function sessionStatusBadge(status: SidebarSessionFixture["status"]) {
  switch (status) {
    case "gate":
      return (
        <Badge variant="gate" className="ml-auto shrink-0">
          Gate
        </Badge>
      );
    case "partial_failure":
      return (
        <Badge variant="failed" className="ml-auto shrink-0">
          Partial
        </Badge>
      );
    case "working":
      return (
        <Badge variant="outline" className="ml-auto shrink-0 text-muted-foreground">
          Working
        </Badge>
      );
    default:
      return null;
  }
}

export function ProductSidebarStory({
  spaces,
  sessions = [],
}: {
  spaces: SidebarSpaceFixture[];
  sessions?: SidebarSessionFixture[];
}) {
  return (
    <div className="flex h-[28rem]">
      <Sidebar>
        <SidebarHeader>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spaces</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            {spaces.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">No spaces linked yet.</p>
            ) : (
              spaces.map((space) => (
                <SidebarNavItem
                  key={space.id}
                  href={`#spaces/${space.id}`}
                  active={space.active}
                  aria-current={space.active ? "page" : undefined}
                  className={space.pendingGateCount ? "justify-between" : undefined}
                >
                  <span className="truncate">{space.name}</span>
                  {space.pendingGateCount !== undefined && space.pendingGateCount > 0 ? (
                    <Badge variant="warning" className="ml-auto shrink-0 px-1.5 py-0 text-[10px]">
                      {space.pendingGateCount}
                    </Badge>
                  ) : null}
                </SidebarNavItem>
              ))
            )}
          </SidebarGroup>
          {sessions.length > 0 ? (
            <SidebarGroup className="mt-3">
              <SidebarGroupLabel>Sessions</SidebarGroupLabel>
              {sessions.map((session) => (
                <SidebarNavItem
                  key={session.id}
                  href={`#sessions/${session.id}`}
                  active={session.active}
                  aria-current={session.active ? "page" : undefined}
                  className={session.status ? "justify-between" : undefined}
                >
                  <span className="truncate">{session.title}</span>
                  {sessionStatusBadge(session.status)}
                </SidebarNavItem>
              ))}
            </SidebarGroup>
          ) : null}
        </SidebarContent>
        <SidebarFooter>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4" />
            New space
          </Button>
        </SidebarFooter>
      </Sidebar>
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Main content</main>
    </div>
  );
}

const meta: Meta<typeof ProductSidebarStory> = {
  title: "shell-ui/Sidebar",
  component: ProductSidebarStory,
  tags: ["autodocs"],
  excludeStories: ["POPULATED_SPACES", "POPULATED_SESSIONS", "ProductSidebarStory"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Murrmure observer sidebar: **Spaces** (with pending-gate badges), **Sessions** global list, and **New space** footer. See CC-10 in `studio-specs/plans/product/plan/17-shell-ui-ux-critique-backlog.md`.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ProductSidebarStory>;

/** Populated spaces + sessions with needs-attention badges (default snapshot). */
export const Default: Story = {
  render: () => <ProductSidebarStory spaces={POPULATED_SPACES} sessions={POPULATED_SESSIONS} />,
};

/** First-run: no spaces linked; CLI path via New space footer. */
export const Empty: Story = {
  render: () => <ProductSidebarStory spaces={[]} />,
};
