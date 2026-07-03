import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { GatePanel } from "../components/GatePanel.js";
import { ViewCanvasHost } from "../components/ViewCanvasHost.js";
import {
  SessionLaneDetailPanel,
  type SessionLaneDetail,
} from "../components/SessionLaneDetailPanel.js";
import { displaySessionStatus, SessionStatusBadge } from "../components/session-status-badge.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { buildViewAppContext } from "../lib/view-app-context.js";
import { mapViewSubmitToGateResolve } from "../lib/view-resolve-adapter.js";
import { getHubBaseUrl, getShellToken } from "../hooks.js";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@murrmure/shell-ui";

const RunFlowchartView = lazy(() =>
  import("../components/RunFlowchartView.js").then((m) => ({ default: m.RunFlowchartView })),
);

function failedStepFromJournal(
  journal?: Array<{ step_id: string; status: string }>,
): string | undefined {
  if (!journal?.length) return undefined;
  const failed = [...journal].reverse().find((e) => e.status === "failed");
  return failed?.step_id ?? journal[journal.length - 1]?.step_id;
}

export function SessionPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const forceAdmin = searchParams.get("admin") === "1";
  const client = useShellClient();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [retryLoading, setRetryLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

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
  const pendingGate = gatesQuery.data?.find((g) => g.status === "pending");
  const graph = graphQuery.data;
  const checkpointCanvas = Boolean(pendingGate?.view_ref && runQuery.data?.flow_id && !forceAdmin);

  const laneDetail = useMemo((): SessionLaneDetail | undefined => {
    if (!focusRunId) return undefined;
    const graphLane = graph?.lanes.find((l) => l.run_id === focusRunId);
    const journal = runQuery.data?.journal_replay;
    const failedStep = failedStepFromJournal(journal);
    return {
      run_id: focusRunId,
      lifecycle: graphLane?.lifecycle ?? focusedRun?.lifecycle ?? "unknown",
      label: graphLane?.label,
      last_step: failedStep,
      error_summary:
        (graphLane?.lifecycle === "failed" || focusedRun?.lifecycle === "failed") && failedStep
          ? `${failedStep} failed`
          : undefined,
    };
  }, [focusRunId, graph, focusedRun, runQuery.data]);

  const displayStatus = displaySessionStatus(
    session?.status,
    runs.map((r) => r.lifecycle),
  );

  const canRetry =
    focusedRun?.lifecycle === "failed" || focusedRun?.lifecycle === "cancelled";
  const logsHref = `/logs?session=${sessionId ?? ""}${focusRunId ? `&run=${focusRunId}` : ""}`;

  const pendingGateId = pendingGate?.gate_id;

  const handleCheckpointSubmit = useCallback(
    async (params: Record<string, unknown>) => {
      if (!pendingGateId || !client) return;
      setResolveLoading(true);
      try {
        await client.gates.resolve(
          pendingGateId,
          mapViewSubmitToGateResolve(params, "submit"),
        );
        await queryClient.refetchQueries({ queryKey: ["gates", focusRunId] });
        await queryClient.refetchQueries({ queryKey: ["run-graph", focusRunId] });
        await queryClient.refetchQueries({ queryKey: ["run", focusRunId] });
        await queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
      } finally {
        setResolveLoading(false);
      }
    },
    [pendingGateId, client, queryClient, focusRunId, sessionId],
  );

  const handleCheckpointCancel = useCallback(async () => {
    if (!pendingGateId || !client) return;
    setResolveLoading(true);
    try {
      await client.gates.resolve(pendingGateId, mapViewSubmitToGateResolve({}, "cancel"));
      await queryClient.refetchQueries({ queryKey: ["gates", focusRunId] });
      await queryClient.refetchQueries({ queryKey: ["run-graph", focusRunId] });
      await queryClient.refetchQueries({ queryKey: ["run", focusRunId] });
    } finally {
      setResolveLoading(false);
    }
  }, [pendingGateId, client, queryClient, focusRunId]);

  const checkpointViewContext = useMemo(() => {
    if (!pendingGate || !runQuery.data) return undefined;
    const resolvedSpaceId =
      runQuery.data.space_id ??
      pendingGate.view_ref?.origin_space_id ??
      "spc_local";
    return buildViewAppContext({
      flow_id: runQuery.data.flow_id ?? graph?.flow_id ?? "flw_unknown",
      space_id: resolvedSpaceId,
      hub_base_url: getHubBaseUrl(),
      token: getShellToken(),
      session_id: sessionId,
      run_id: focusRunId,
      gate: pendingGate,
      exec_context: runQuery.data.exec_context,
    });
  }, [
    pendingGate?.gate_id,
    pendingGate?.step_id,
    pendingGate?.payload_ref,
    pendingGate?.form,
    pendingGate?.view_ref?.view_id,
    pendingGate?.view_ref?.origin_space_id,
    pendingGate?.view_ref?.entry_url,
    runQuery.data?.flow_id,
    runQuery.data?.space_id,
    runQuery.data?.exec_context,
    graph?.flow_id,
    sessionId,
    focusRunId,
  ]);

  if (checkpointCanvas && pendingGate && runQuery.data && checkpointViewContext) {
    return (
      <AppShell canvasMode>
        <ViewCanvasHost
          title={session?.title ?? "Session"}
          viewRef={pendingGate.view_ref}
          context={checkpointViewContext}
          onSubmit={handleCheckpointSubmit}
          onCancel={handleCheckpointCancel}
          submitting={resolveLoading}
          adminHref={`/sessions/${sessionId}?admin=1`}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{session?.title ?? "Session"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-muted-foreground">{sessionId}</p>
              {session?.status ? <SessionStatusBadge status={displayStatus} /> : null}
            </div>
          </div>

          {graph ? (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading flowchart…</p>}>
              <RunFlowchartView
                graph={graph}
                selectedRunId={focusRunId}
                onSelectLane={setSelectedRunId}
              />
            </Suspense>
          ) : runQuery.data ? (
            <JournalWaterfallView
              run={runQuery.data}
              isLive={runQuery.data.lifecycle === "working"}
              retryLoading={retryLoading}
              retryingStepId={retryLoading ? laneDetail?.last_step : undefined}
              onRetry={
                canRetry
                  ? async (_stepId) => {
                      if (!focusRunId) return;
                      setRetryLoading(true);
                      try {
                        const result = await client!.runs.retry(focusRunId);
                        setSelectedRunId(result.run.run_id);
                        await queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
                      } finally {
                        setRetryLoading(false);
                      }
                    }
                  : undefined
              }
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {runs.map((run) => (
                <button
                  key={run.run_id}
                  type="button"
                  className={`block w-full rounded-md border px-3 py-2 text-left ${
                    run.run_id === focusRunId ? "border-primary bg-muted/40" : "border-border"
                  }`}
                  onClick={() => setSelectedRunId(run.run_id)}
                >
                  <span className="font-mono">{run.run_id}</span>
                  <Badge className="ml-2" variant="outline">
                    {run.lifecycle}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-96">
          <SessionLaneDetailPanel
            lane={laneDetail}
            retryLoading={retryLoading}
            onRetry={
              canRetry
                ? async () => {
                    if (!focusRunId) return;
                    setRetryLoading(true);
                    try {
                      const result = await client!.runs.retry(focusRunId);
                      setSelectedRunId(result.run.run_id);
                      await queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
                    } finally {
                      setRetryLoading(false);
                    }
                  }
                : undefined
            }
          />

          {pendingGate ? (
            <GatePanel
              gate={pendingGate}
              graph={graph}
              onSubmit={async (values) => {
                await client!.gates.resolve(pendingGate.gate_id, values);
                await gatesQuery.refetch();
                await graphQuery.refetch();
              }}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session logs</CardTitle>
            </CardHeader>
            <CardContent>
              <Link to={logsHref} className="text-sm text-primary underline">
                {canRetry ? "View error in log explorer" : "Open in log explorer"}
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
