import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { GatePanel } from "../components/GatePanel.js";
import { NotificationInboxItem } from "../components/NotificationInboxItem.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";

export function NotificationsPage() {
  const client = useShellClient();
  const queryClient = useQueryClient();
  const activeRowRef = useRef<HTMLDivElement>(null);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "pending"],
    queryFn: () => client!.notifications.list("pending"),
    enabled: Boolean(client),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => client!.notifications.dismiss(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const gateNotification = notifications.find((n) => n.kind === "gate" && n.gate_id);
  const activeGateId = gateNotification?.gate_id;

  const gateQuery = useQuery({
    queryKey: ["gate", gateNotification?.gate_id],
    queryFn: async () => {
      if (!gateNotification?.run_id || !gateNotification.gate_id) return null;
      const gates = await client!.gates.listForRun(gateNotification.run_id);
      return gates.find((g) => g.gate_id === gateNotification.gate_id) ?? gates[0] ?? null;
    },
    enabled: Boolean(client && gateNotification?.gate_id && gateNotification?.run_id),
  });

  const graphQuery = useQuery({
    queryKey: ["run-graph", gateNotification?.run_id],
    queryFn: () => client!.runs.graph(gateNotification!.run_id!),
    enabled: Boolean(client && gateNotification?.run_id),
  });

  const resolve = useMutation({
    mutationFn: (input: { decision: "approved" | "rejected"; form_values: Record<string, unknown> }) => {
      if (!gateNotification?.gate_id) throw new Error("No gate");
      return client!.gates.resolve(gateNotification.gate_id, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["gate"] });
    },
  });

  useEffect(() => {
    if (gateQuery.data) {
      activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [gateQuery.data?.gate_id]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Actionable inbox — gates and failures.</p>
        </div>

        {gateQuery.data ? (
          <div
            id="notification-active-gate-panel"
            aria-controls="notification-active-gate-row"
            className="relative rounded-md ring-1 ring-primary/30"
          >
            <div
              className="pointer-events-none absolute -bottom-3 left-6 z-10 h-3 w-px bg-primary/40"
              aria-hidden="true"
            />
            <GatePanel
              gate={gateQuery.data}
              graph={graphQuery.data}
              submitting={resolve.isPending}
              onSubmit={async (values) => {
                await resolve.mutateAsync(values);
              }}
            />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbox</CardTitle>
            <CardDescription>{notifications.length} pending</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
            ) : (
              notifications.map((n) => (
                <NotificationInboxItem
                  key={n.notification_id}
                  ref={n.gate_id === activeGateId ? activeRowRef : undefined}
                  notification={n}
                  activeGateId={activeGateId}
                  onDismiss={() => dismiss.mutate(n.notification_id)}
                  runLink={
                    n.run_id ? (
                      <Link
                        className="text-xs text-primary underline"
                        to={`/runs/${n.run_id}${n.gate_id ? `?gate=${n.gate_id}` : ""}`}
                      >
                        Open run
                      </Link>
                    ) : null
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
