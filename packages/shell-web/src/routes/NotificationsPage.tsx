import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { GatePanel } from "../components/GatePanel.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { useStepCanvasBinding } from "../hooks/useStepCanvasBinding.js";

export function NotificationsPage() {
  const client = useShellClient();
  const queryClient = useQueryClient();

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
  const humanStepNotification = notifications.find(
    (n) => n.kind === "human_step" && n.run_id && n.step_id,
  );

  const humanRunQuery = useQuery({
    queryKey: ["run", humanStepNotification?.run_id],
    queryFn: () => client!.runs.get(humanStepNotification!.run_id!),
    enabled: Boolean(client && humanStepNotification?.run_id),
  });

  const humanCanvas = useStepCanvasBinding(
    humanRunQuery.data && client && humanStepNotification
      ? {
          client,
          run: humanRunQuery.data,
          flow_id: humanRunQuery.data.flow_id ?? "flw_unknown",
          space_id: humanRunQuery.data.space_id ?? humanStepNotification.space_id,
          title: humanStepNotification.title,
          closeHref: humanStepNotification.run_id ? `/runs/${humanStepNotification.run_id}` : undefined,
        }
      : null,
  );

  const gateNotification = notifications.find((n) => n.kind === "gate" && n.gate_id);

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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Actionable inbox — gates and failures.</p>
        </div>

        {humanCanvas.showCanvas && humanCanvas.canvas ? humanCanvas.canvas : null}

        {gateQuery.data ? (
          <GatePanel
            gate={gateQuery.data}
            graph={graphQuery.data}
            submitting={resolve.isPending}
            onSubmit={async (values) => {
              await resolve.mutateAsync(values);
            }}
          />
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
                <div key={n.notification_id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.summary ? <p className="text-xs text-muted-foreground">{n.summary}</p> : null}
                    {n.run_id ? (
                      <Link
                        className="text-xs text-primary underline"
                        to={
                          n.kind === "human_step" && n.session_id
                            ? `/sessions/${n.session_id}`
                            : `/runs/${n.run_id}${n.gate_id ? `?gate=${n.gate_id}` : ""}`
                        }
                      >
                        Open {n.kind === "human_step" ? "view" : "run"}
                      </Link>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => dismiss.mutate(n.notification_id)}
                  >
                    Dismiss
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
