import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GatePanel } from "../components/GatePanel.js";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { StepExecutorOutputPanel } from "../components/StepExecutorOutputPanel.js";
import { DismissRunButton } from "../components/DismissRunButton.js";
import { SharedFlowPage } from "../components/SharedFlowPage.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { activeRunRefetchInterval } from "../lib/invalidate-run-queries.js";
import { useStepCanvasBinding } from "../hooks/useStepCanvasBinding.js";
import { useRunStepInspector } from "../hooks/useRunStepInspector.js";
import { Button } from "@murrmure/shell-ui";

export function RunPage() {
  const { runId } = useParams();
  const [params] = useSearchParams();
  const focusGate = params.get("gate");
  const operatorMode = params.get("operator") === "1";
  const client = useShellClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedLaneId, setSelectedLaneId] = useState<string | undefined>();

  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => client!.runs.get(runId!),
    enabled: Boolean(client && runId),
    refetchInterval: (query) => activeRunRefetchInterval(query.state.data?.lifecycle),
  });

  const graphQuery = useQuery({
    queryKey: ["run-graph", runId],
    queryFn: () => client!.runs.graph(runId!),
    enabled: Boolean(client && runId),
    refetchInterval: () => activeRunRefetchInterval(runQuery.data?.lifecycle),
  });

  const gatesQuery = useQuery({
    queryKey: ["gates", runId],
    queryFn: () => client!.gates.listForRun(runId!),
    enabled: Boolean(client && runId),
    refetchInterval: () => activeRunRefetchInterval(runQuery.data?.lifecycle),
  });

  const run = runQuery.data;
  const gates = gatesQuery.data ?? [];
  const orchestrationGate = gates.find(
    (g) => g.status === "pending" && g.step_id.startsWith("orchestration:"),
  );
  const focused =
    focusGate ? gates.find((g) => g.gate_id === focusGate) : orchestrationGate ?? gates.find((g) => g.status === "pending");

  const bindingInput = useMemo(
    () =>
      run && client && runId
        ? {
            client,
            run,
            flow_id: run.flow_id ?? graphQuery.data?.flow_id ?? "flw_unknown",
            space_id: run.space_id ?? "",
            title: run.open_steps?.[0]?.step_id ?? "Review",
            adminHref: `/runs/${runId}?operator=1`,
            closeHref: `/runs/${runId}`,
          }
        : null,
    [client, run, graphQuery.data?.flow_id, runId],
  );

  const { showCanvas, canvas } = useStepCanvasBinding(bindingInput);

  const graphStepIds =
    graphQuery.data?.step_memos?.map((m) => m.step_id) ?? graphQuery.data?.nodes?.map((n) => n.step_id);
  const pollWhileActive = run?.lifecycle === "working" || run?.lifecycle === "input-required";
  const { selectedStepId, setSelectedStepId, journalEntries } = useRunStepInspector({
    run,
    sessionId: run?.session_id,
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
          <Link to={`/runs/${runId}`} className="text-sm text-primary underline">
            Back to checkpoint view
          </Link>
        </div>
      ) : null}
      title={graphQuery.data?.flow_name ?? "Run"}
      subtitle={runId}
      status={run?.lifecycle}
      graph={graphQuery.data}
      graphFallback={run ? <JournalWaterfallView run={run} /> : null}
      execContext={run?.exec_context as Record<string, unknown> | undefined}
      selectedRunId={selectedLaneId ?? runId}
      selectedStepId={selectedStepId}
      onSelectLane={setSelectedLaneId}
      onSelectStep={setSelectedStepId}
      actions={
        <div className="flex items-center gap-2">
          {run?.session_id ? (
            <Link to={`/sessions/${run.session_id}`} className="text-sm text-primary underline">
              View session
            </Link>
          ) : null}
          {runId ? (
            <DismissRunButton
              runId={runId}
              spaceId={run?.space_id}
              lifecycle={run?.lifecycle}
              onDismissed={async () => {
                await queryClient.invalidateQueries({ queryKey: ["run", runId] });
                if (run?.space_id) navigate(`/spaces/${run.space_id}`);
              }}
            />
          ) : null}
        </div>
      }
      secondary={
        <>
              {run ? (
                <StepExecutorOutputPanel
                  className="min-h-0 flex-1"
                  run={run}
                  stepId={selectedStepId}
                  journalEntries={journalEntries}
                  graphStepIds={graphStepIds}
                  onSelectStep={setSelectedStepId}
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
              ) : null}

              {run?.lifecycle === "failed" || run?.lifecycle === "cancelled" ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    const result = await client!.runs.retry(runId!);
                    await queryClient.invalidateQueries({ queryKey: ["run", runId] });
                    window.location.assign(`/runs/${result.run.run_id}`);
                  }}
                >
                  Retry
                </Button>
              ) : null}
        </>
      }
    />
  );
}

export { SessionPage } from "./SessionPage.js";
