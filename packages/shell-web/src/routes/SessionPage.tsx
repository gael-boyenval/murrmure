import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { StepExecutorOutputPanel } from "../components/StepExecutorOutputPanel.js";
import { DismissRunButton } from "../components/DismissRunButton.js";
import { GatePanel } from "../components/GatePanel.js";
import { SharedFlowPage } from "../components/SharedFlowPage.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { useStepCanvasBinding } from "../hooks/useStepCanvasBinding.js";
import { useRunStepInspector } from "../hooks/useRunStepInspector.js";
import { activeRunRefetchInterval } from "../lib/invalidate-run-queries.js";
import { Button } from "@murrmure/shell-ui";

export function SessionPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const operatorMode = searchParams.get("operator") === "1";
  const client = useShellClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();

  const runsQuery = useQuery({
    queryKey: ["session-runs", sessionId],
    queryFn: () => client!.sessions.listRuns(sessionId!),
    enabled: Boolean(client && sessionId),
    refetchInterval: (query) =>
      activeRunRefetchInterval(
        query.state.data?.runs.some((r) => r.lifecycle === "working" || r.lifecycle === "input-required")
          ? "working"
          : undefined,
      ),
  });

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => client!.sessions.get(sessionId!),
    enabled: Boolean(client && sessionId),
    refetchInterval: () =>
      activeRunRefetchInterval(
        runsQuery.data?.runs.some((r) => r.lifecycle === "working" || r.lifecycle === "input-required")
          ? "working"
          : undefined,
      ),
  });

  const focusRunId = selectedRunId ?? runsQuery.data?.runs[0]?.run_id;

  const runQuery = useQuery({
    queryKey: ["run", focusRunId],
    queryFn: () => client!.runs.get(focusRunId!),
    enabled: Boolean(client && focusRunId),
    refetchInterval: (query) => activeRunRefetchInterval(query.state.data?.lifecycle),
  });

  const graphQuery = useQuery({
    queryKey: ["run-graph", focusRunId],
    queryFn: () => client!.runs.graph(focusRunId!),
    enabled: Boolean(client && focusRunId),
    refetchInterval: () => activeRunRefetchInterval(runQuery.data?.lifecycle),
  });

  const gatesQuery = useQuery({
    queryKey: ["gates", focusRunId],
    queryFn: () => client!.gates.listForRun(focusRunId!),
    enabled: Boolean(client && focusRunId),
    refetchInterval: () => activeRunRefetchInterval(runQuery.data?.lifecycle),
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
      run && client && sessionId
        ? {
            client,
            run,
            flow_id: run.flow_id ?? graphQuery.data?.flow_id ?? "flw_unknown",
            space_id: run.space_id ?? "",
            title: session?.title ?? run.open_steps?.[0]?.step_id ?? "Session",
            adminHref: `/sessions/${sessionId}?operator=1`,
            closeHref: `/sessions/${sessionId}`,
          }
        : null,
    [client, run, graphQuery.data?.flow_id, session?.title, sessionId],
  );

  const { showCanvas, canvas } = useStepCanvasBinding(bindingInput);

  const graphStepIds =
    graphQuery.data?.step_memos?.map((m) => m.step_id) ?? graphQuery.data?.nodes?.map((n) => n.step_id);
  const pollWhileActive =
    run?.lifecycle === "working" || run?.lifecycle === "input-required" || focusedRun?.lifecycle === "working";
  const { selectedStepId, setSelectedStepId, journalEntries } = useRunStepInspector({
    run,
    sessionId,
    graphStepIds,
    pollWhileActive,
  });

  if (showCanvas && canvas && !operatorMode) {
    return canvas;
  }

  return (
    <SharedFlowPage
      topBanner={showCanvas && operatorMode ? (
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2">
          <Link to={`/sessions/${sessionId}`} className="text-sm text-primary underline">
            Back to checkpoint view
          </Link>
        </div>
      ) : null}
      title={session?.title ?? graphQuery.data?.flow_name ?? "Session"}
      subtitle={sessionId}
      status={session?.status}
      graph={graphQuery.data}
      graphFallback={runQuery.data ? <JournalWaterfallView run={runQuery.data} /> : null}
      execContext={run?.exec_context as Record<string, unknown> | undefined}
      selectedRunId={focusRunId}
      selectedStepId={selectedStepId}
      onSelectLane={setSelectedRunId}
      onSelectStep={setSelectedStepId}
      actions={
        focusRunId ? (
          <DismissRunButton
            runId={focusRunId}
            spaceId={run?.space_id}
            lifecycle={run?.lifecycle ?? focusedRun?.lifecycle}
            onDismissed={async () => {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["run", focusRunId] }),
                queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] }),
                queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
              ]);
              if (run?.space_id) navigate(`/spaces/${run.space_id}`);
            }}
          />
        ) : null
      }
      secondary={
        <>
              {run && focusRunId ? (
                <StepExecutorOutputPanel
                  className="min-h-0 flex-1"
                  run={run}
                  stepId={selectedStepId}
                  journalEntries={journalEntries}
                  graphStepIds={graphStepIds}
                  onSelectStep={setSelectedStepId}
                />
              ) : null}

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
        </>
      }
    />
  );
}
