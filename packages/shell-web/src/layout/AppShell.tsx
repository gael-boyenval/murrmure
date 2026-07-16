import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  Badge,
  Button,
  cn,
} from "@murrmure/shell-ui";
import { NotificationBell } from "../components/NotificationBell.js";
import { ProfileMenu } from "../components/ProfileMenu.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function AppShell({
  children,
  canvasMode = false,
}: {
  children: ReactNode;
  canvasMode?: boolean;
}) {
  const location = useLocation();
  const client = useShellClient();

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client),
  });

  const spaces = spacesQuery.data ?? [];

  if (canvasMode) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border px-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">
          Murrmure
        </Link>
        <Badge variant="outline" className="text-muted-foreground">
          Observer
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <Sidebar className="min-h-0">
          <SidebarHeader>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spaces</span>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              {spaces.length === 0 ? (
                <p className="px-2 py-2 text-sm text-muted-foreground">No spaces linked yet.</p>
              ) : (
                spaces.map((space) => {
                  const href = `/spaces/${space.space_id}`;
                  const active = location.pathname === href || location.pathname.startsWith(`${href}/`);
                  return (
                    <Link
                      key={space.space_id}
                      to={href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {space.name ?? space.slug ?? space.space_id}
                    </Link>
                  );
                })
              )}
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/spaces/new">
                <Plus className="h-4 w-4" />
                New space
              </Link>
            </Button>
          </SidebarFooter>
        </Sidebar>
        <main className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
