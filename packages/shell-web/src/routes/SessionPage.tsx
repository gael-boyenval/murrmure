import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { GatePanel } from "../components/GatePanel.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { useStepCanvasBinding } from "../hooks/useStepCanvasBinding.js";
import { Button, Card, CardContent, CardHeader, CardTitle, Badge } from "@murrmure/shell-ui";

const RunFlowchartView = lazy(() =>
  import("../components/RunFlowchartView.js").then((m) => ({ default: m.RunFlowchartView })),
);

export function SessionPage() {
  const { sessionId } = useParams();
  const client = useShellClient();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => client!.sessions.get(sessionId!),
    enabled: Boolean(client && sessionId),
  });

  const runsQuery = useQuery({
    queryKey: ["session-runs", sessionId],
    queryFn: () => client!.sessions.listRuns(sessionId!),
    enabled: Boolean(client && sessionId),
  });

  const focusRunId = selectedRunId ?? runsQuery.data?.runs[0]?.run_id;

  const runQuery = useQuery({
    queryKey: ["run", focusRunId],
    queryFn: () => client!.runs.get(focusRunId!),
    enabled: Boolean(client && focusRunId),
  });

  const graphQuery = useQuery({
    queryKey: ["run-graph", focusRunId],
    queryFn: () => client!.runs.graph(focusRunId!),
    enabled: Boolean(client && focusRunId),
  });

  const gatesQuery = useQuery({
    queryKey: ["gates", focusRunId],
    queryFn: () => client!.gates.listForRun(focusRunId!),
    enabled: Boolean(client && focusRunId),
  });

  const session = sessionQuery.data;
  const runs = runsQuery.data?.runs ?? [];
  const focusedRun = runs.find((r) => r.run_id === focusRunId);
  const run = runQuery.data;
  const orchestrationGate = gatesQuery.data?.find(
    (g) => g.status === "pending" && g.step_id.startsWith("orchestration:"),
  );

  const bindingInput = useMemo(
    () =>
      run && client
        ? {
            client,
            run,
            flow_id: run.flow_id ?? graphQuery.data?.flow_id ?? "flw_unknown",
            space_id: run.space_id ?? "",
            title: session?.title ?? run.active_human_step?.step_id ?? "Session",
            adminHref: `/sessions/${sessionId}?operator=1`,
          }
        : null,
    [client, run, graphQuery.data?.flow_id, session?.title, sessionId],
  );

  const { showCanvas, canvas } = useStepCanvasBinding(bindingInput);

  if (showCanvas && canvas) {
    return canvas;
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{session?.title ?? "Session"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-muted-foreground">{sessionId}</p>
              {session?.status ? <Badge variant="outline">{session.status}</Badge> : null}
            </div>
          </div>

          {graphQuery.data ? (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading flowchart…</p>}>
              <RunFlowchartView
                graph={graphQuery.data}
                selectedRunId={focusRunId}
                onSelectLane={setSelectedRunId}
              />
            </Suspense>
          ) : runQuery.data ? (
            <JournalWaterfallView run={runQuery.data} />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {runs.map((runRow) => (
                <button
                  key={runRow.run_id}
                  type="button"
                  className={`block w-full rounded-md border px-3 py-2 text-left ${
                    runRow.run_id === focusRunId ? "border-primary bg-muted/40" : "border-border"
                  }`}
                  onClick={() => setSelectedRunId(runRow.run_id)}
                >
                  <span className="font-mono">{runRow.run_id}</span>
                  <Badge className="ml-2" variant="outline">
                    {runRow.lifecycle}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-96">
          {orchestrationGate ? (
            <GatePanel
              gate={orchestrationGate}
              graph={graphQuery.data}
              onSubmit={async (values) => {
                await client!.gates.resolve(orchestrationGate.gate_id, values);
                await gatesQuery.refetch();
                await graphQuery.refetch();
              }}
            />
          ) : null}

          {focusedRun?.lifecycle === "failed" || focusedRun?.lifecycle === "cancelled" ? (
            <Button
              variant="outline"
              onClick={async () => {
                if (!focusRunId) return;
                const result = await client!.runs.retry(focusRunId);
                setSelectedRunId(result.run.run_id);
                await queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
              }}
            >
              Retry failed lane
            </Button>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session logs</CardTitle>
            </CardHeader>
            <CardContent>
              <Link to={`/logs?session=${sessionId}`} className="text-sm text-primary underline">
                Open in log explorer
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
