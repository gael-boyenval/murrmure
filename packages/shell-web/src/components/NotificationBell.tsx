import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge, Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function NotificationBell() {
  const client = useShellClient();
  const query = useQuery({
    queryKey: ["notifications", "pending"],
    queryFn: () => client!.notifications.list("pending"),
    enabled: Boolean(client),
    refetchInterval: 60_000,
  });

  const count = query.data?.pending_count ?? 0;

  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/notifications" className="gap-2">
        <Bell className="h-4 w-4" />
        Needs you
        {count > 0 ? <Badge variant="default">{count}</Badge> : null}
      </Link>
    </Button>
  );
}
