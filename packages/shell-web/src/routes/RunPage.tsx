import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { GatePanel } from "../components/GatePanel.js";
import { ViewCanvasHost } from "../components/ViewCanvasHost.js";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { buildViewAppContext } from "../lib/view-app-context.js";
import { mapViewSubmitToGateResolve } from "../lib/view-resolve-adapter.js";
import { getHubBaseUrl, getShellToken } from "../hooks.js";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@murrmure/shell-ui";

const RunFlowchartView = lazy(() =>
  import("../components/RunFlowchartView.js").then((m) => ({ default: m.RunFlowchartView })),
);

export function RunPage() {
  const { runId } = useParams();
  const [params] = useSearchParams();
  const focusGate = params.get("gate");
  const forceAdmin = params.get("admin") === "1";
  const client = useShellClient();
  const queryClient = useQueryClient();
  const [selectedLaneId, setSelectedLaneId] = useState<string | undefined>();
  const [resolveLoading, setResolveLoading] = useState(false);

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => client!.runs.get(runId!),
    enabled: Boolean(client && runId),
  });

  const graphQuery = useQuery({
    queryKey: ["run-graph", runId],
    queryFn: () => client!.runs.graph(runId!),
    enabled: Boolean(client && runId),
  });

  const gatesQuery = useQuery({
    queryKey: ["gates", runId],
    queryFn: () => client!.gates.listForRun(runId!),
    enabled: Boolean(client && runId),
  });

  const gates = gatesQuery.data ?? [];
  const focused = focusGate ? gates.find((g) => g.gate_id === focusGate) : gates.find((g) => g.status === "pending");
  const run = runQuery.data;
  const checkpointCanvas = Boolean(
    focused?.status === "pending" && focused.view_ref && run?.flow_id && !forceAdmin,
  );

  const focusedGateId = focused?.gate_id;

  const handleCheckpointSubmit = useCallback(
    async (submitParams: Record<string, unknown>) => {
      if (!focusedGateId || !client) return;
      setResolveLoading(true);
      try {
        await client.gates.resolve(
          focusedGateId,
          mapViewSubmitToGateResolve(submitParams, "submit"),
        );
        await queryClient.refetchQueries({ queryKey: ["gates", runId] });
        await queryClient.refetchQueries({ queryKey: ["run-graph", runId] });
        await queryClient.refetchQueries({ queryKey: ["run", runId] });
      } finally {
        setResolveLoading(false);
      }
    },
    [focusedGateId, client, queryClient, runId],
  );

  const handleCheckpointCancel = useCallback(async () => {
    if (!focusedGateId || !client) return;
    setResolveLoading(true);
    try {
      await client.gates.resolve(focusedGateId, mapViewSubmitToGateResolve({}, "cancel"));
      await queryClient.refetchQueries({ queryKey: ["gates", runId] });
      await queryClient.refetchQueries({ queryKey: ["run-graph", runId] });
      await queryClient.refetchQueries({ queryKey: ["run", runId] });
    } finally {
      setResolveLoading(false);
    }
  }, [focusedGateId, client, queryClient, runId]);

  const checkpointViewContext = useMemo(() => {
    if (!focused || !run) return undefined;
    return buildViewAppContext({
      flow_id: run.flow_id ?? graphQuery.data?.flow_id ?? "flw_unknown",
      space_id: run.space_id ?? focused.view_ref?.origin_space_id ?? "spc_local",
      hub_base_url: getHubBaseUrl(),
      token: getShellToken(),
      session_id: run.session_id,
      run_id: runId,
      gate: focused,
      exec_context: run.exec_context,
    });
  }, [
    focused?.gate_id,
    focused?.step_id,
    focused?.payload_ref,
    focused?.form,
    focused?.view_ref?.view_id,
    focused?.view_ref?.origin_space_id,
    focused?.view_ref?.entry_url,
    run?.flow_id,
    run?.space_id,
    run?.session_id,
    run?.exec_context,
    graphQuery.data?.flow_id,
    runId,
  ]);

  if (checkpointCanvas && focused && run && checkpointViewContext) {
    return (
      <AppShell canvasMode>
        <ViewCanvasHost
          title={focused.title ?? "Checkpoint"}
          viewRef={focused.view_ref}
          context={checkpointViewContext}
          onSubmit={handleCheckpointSubmit}
          onCancel={handleCheckpointCancel}
          submitting={resolveLoading}
          adminHref={`/runs/${runId}?admin=1${focusGate ? `&gate=${focusGate}` : ""}`}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-muted-foreground">{runId}</p>
            {run?.lifecycle ? <Badge variant="outline">{run.lifecycle}</Badge> : null}
            {run?.session_id ? (
              <Link to={`/sessions/${run.session_id}`} className="text-sm text-primary underline">
                View session
              </Link>
            ) : null}
          </div>
        </div>

        {graphQuery.data ? (
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading flowchart…</p>}>
            <RunFlowchartView
              graph={graphQuery.data}
              selectedRunId={selectedLaneId ?? runId}
              onSelectLane={setSelectedLaneId}
            />
          </Suspense>
        ) : run ? (
          <JournalWaterfallView
            run={run}
            isLive={run.lifecycle === "working"}
            onRetry={
              run.lifecycle === "failed" || run.lifecycle === "cancelled"
                ? async (_stepId) => {
                    const result = await client!.runs.retry(runId!);
                    await queryClient.invalidateQueries({ queryKey: ["run", runId] });
                    window.location.assign(`/runs/${result.run.run_id}`);
                  }
                : undefined
            }
          />
        ) : null}

        {focused && focused.status === "pending" ? (
          <GatePanel
            gate={focused}
            graph={graphQuery.data}
            onSubmit={async (values) => {
              await client!.gates.resolve(focused.gate_id, values);
              await gatesQuery.refetch();
              await graphQuery.refetch();
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {gates.length === 0 ? <p className="text-muted-foreground">No gates on this run.</p> : null}
              {gates.map((g) => (
                <div key={g.gate_id}>
                  <Link to={`/runs/${runId}?gate=${g.gate_id}`} className="text-primary underline">
                    {g.gate_id} — {g.status}
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </AppShell>
  );
}

export { SessionPage } from "./SessionPage.js";
