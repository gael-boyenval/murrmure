import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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

export interface PrototypeSpace {
  space_id: string;
  name: string;
}

export interface PrototypeShellProps {
  children: ReactNode;
  spaces?: PrototypeSpace[];
  activePath?: string;
  /** Pre-connection setup — minimal header without notification or space chrome. */
  headerVariant?: "default" | "disconnected";
}

export function PrototypeShell({
  children,
  spaces = [
    { space_id: "spc_demo", name: "Demo space" },
    { space_id: "spc_ops", name: "Ops" },
  ],
  activePath = "/spaces/spc_demo",
  headerVariant = "default",
}: PrototypeShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center gap-4 border-b border-border px-4">
        <Link to="/" className="text-sm font-semibold tracking-tight">
          Murrmure
        </Link>
        <Badge variant="outline" className="text-muted-foreground">
          Observer
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {headerVariant === "disconnected" ? (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          ) : (
            <>
              <NotificationBell />
              <ProfileMenu />
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1">
        <Sidebar>
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
                  const active = activePath === href || activePath.startsWith(`${href}/`);
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
                      {space.name}
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
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
