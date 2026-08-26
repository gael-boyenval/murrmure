import { useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { JournalWaterfallView } from "../components/JournalWaterfallView.js";
import { StepExecutorOutputPanel } from "../components/StepExecutorOutputPanel.js";
import { DismissRunButton } from "../components/DismissRunButton.js";
import { GatePanel } from "../components/GatePanel.js";
import { SharedFlowPage } from "../components/SharedFlowPage.js";
import { MeetingTranscriptPane, isHumanMeetingChair } from "../components/MeetingTranscriptPane.js";
import { MeetingCloseButton } from "../components/MeetingCloseButton.js";
import { MeetingResumeButton } from "../components/MeetingResumeButton.js";
import { MeetingComposer } from "../components/MeetingComposer.js";
import { MeetingAgentActivity } from "../components/MeetingAgentActivity.js";
import type { MeetingReplyTarget } from "../lib/meeting-reply.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { useStepCanvasBinding } from "../hooks/useStepCanvasBinding.js";
import { useRunStepInspector } from "../hooks/useRunStepInspector.js";
import { useMeetingTranscript } from "../hooks/useMeetingTranscript.js";
import { activeRunRefetchInterval } from "../lib/invalidate-run-queries.js";
import { defaultSessionPane, sessionPanes, type SessionPane } from "../lib/session-pane.js";
import { Button, cn } from "@murrmure/shell-ui";
import { AppShell } from "../layout/AppShell.js";

const PANE_LABEL: Record<SessionPane, string> = {
  transcript: "Transcript",
  review: "Review",
  flowchart: "Flowchart",
  journal: "Journal",
};

export function sessionPaneLabel(pane: SessionPane, isMeeting: boolean): string {
  return isMeeting && pane === "flowchart" ? "Agent activity" : PANE_LABEL[pane];
}

export function defaultSessionRunId(
  runs: Array<{ run_id: string; lifecycle: string }>,
): string | undefined {
  return (
    runs.find((candidate) => candidate.lifecycle === "working" || candidate.lifecycle === "input-required")
      ?.run_id ?? runs[0]?.run_id
  );
}

export function SessionPage() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const operatorMode = searchParams.get("operator") === "1";
  const client = useShellClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [userPane, setUserPane] = useState<SessionPane | null>(null);
  const [replyTo, setReplyTo] = useState<MeetingReplyTarget | null>(null);

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

  const transcriptQuery = useMeetingTranscript(sessionId);
  const transcript = transcriptQuery.data ?? null;
  const isMeeting = transcript != null;
  const meetingResolved = transcriptQuery.isFetched || transcriptQuery.isError;

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client),
  });
  const spaceLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const space of spacesQuery.data ?? []) {
      const label = space.slug ?? space.name;
      if (label) labels[space.space_id] = label;
    }
    return labels;
  }, [spacesQuery.data]);

  const runs = runsQuery.data?.runs ?? [];
  const defaultFocusRunId = defaultSessionRunId(runs);
  const focusRunId = selectedRunId ?? defaultFocusRunId;

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
    placeholderData: (previous) => previous,
  });

  const gatesQuery = useQuery({
    queryKey: ["gates", focusRunId],
    queryFn: () => client!.gates.listForRun(focusRunId!),
    enabled: Boolean(client && focusRunId),
    refetchInterval: () => activeRunRefetchInterval(runQuery.data?.lifecycle),
  });

  const session = sessionQuery.data;
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

  const panes = sessionPanes({ isMeeting, hasView: Boolean(showCanvas && canvas) });
  const resolvedPane = defaultSessionPane({
    operatorMode,
    isMeeting,
    meetingResolved,
    hasView: Boolean(showCanvas && canvas),
  });
  const pane = userPane && panes.includes(userPane) ? userPane : resolvedPane;
  const isHumanChair = Boolean(transcript && isHumanMeetingChair(transcript.chair));
  const canClose = Boolean(sessionId) && isMeeting && transcript.status === "open" && isHumanChair;
  const canResume = Boolean(sessionId) && isMeeting && transcript.status === "closed" && isHumanChair;

  const flowchartSecondary = (
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
  );

  return (
    <AppShell fillMain>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <header className="shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {session?.title ?? graphQuery.data?.flow_name ?? "Session"}
              </h1>
              {pane !== "transcript" && sessionId ? (
                <p className="mt-1 font-mono text-sm text-muted-foreground">{sessionId}</p>
              ) : null}
            </div>
            {focusRunId ? (
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
            ) : null}
          </div>
        </header>

        <div
          className="flex shrink-0 gap-1 border-b border-border pb-2"
          role="tablist"
          aria-label="Session views"
        >
          {panes.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium",
                pane === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setUserPane(id)}
            >
              {sessionPaneLabel(id, isMeeting)}
            </button>
          ))}
        </div>

        {isMeeting && transcript ? (
          <div
            role="tabpanel"
            aria-label="Transcript"
            hidden={pane !== "transcript"}
            className={cn(
              "min-h-0 flex-1 flex-col overflow-hidden",
              pane === "transcript" ? "flex" : "hidden",
            )}
          >
            <MeetingTranscriptPane
              title={session?.title ?? "Meeting"}
              goal={session?.subject}
              transcript={transcript}
              spaceLabels={spaceLabels}
              onReply={canClose ? setReplyTo : undefined}
              closeAction={
                canClose && sessionId ? (
                  <MeetingCloseButton sessionId={sessionId} />
                ) : canResume && sessionId ? (
                  <MeetingResumeButton sessionId={sessionId} />
                ) : null
              }
              composer={
                canClose && sessionId ? (
                  <MeetingComposer
                    sessionId={sessionId}
                    transcript={transcript}
                    spaceLabels={spaceLabels}
                    replyTo={replyTo}
                    onClearReply={() => setReplyTo(null)}
                    onSent={() => transcriptQuery.refetch().then(() => undefined)}
                  />
                ) : null
              }
            />
          </div>
        ) : null}

        {showCanvas && canvas ? (
          <div
            role="tabpanel"
            aria-label="Review"
            hidden={pane !== "review"}
            className={cn(
              "min-h-0 flex-1 flex-col overflow-hidden",
              pane === "review" ? "flex" : "hidden",
            )}
          >
            {canvas}
          </div>
        ) : null}

        {pane === "flowchart" ? (
          <div
            role="tabpanel"
            aria-label="Flowchart"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {isMeeting && transcript ? (
              <>
                <p className="mb-2 shrink-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {transcript.status === "open"
                    ? "Each roster seat has its own process. Watch the live PTY here. Later messages reuse that process."
                    : "Room is closed. Last PTY output stays until the hub restarts."}
                </p>
                {sessionId ? (
                  <MeetingAgentActivity sessionId={sessionId} spaceLabels={spaceLabels} />
                ) : null}
              </>
            ) : (
              <SharedFlowPage
                embedded
                title={session?.title ?? graphQuery.data?.flow_name ?? "Session"}
                subtitle={sessionId}
                status={session?.status}
                graph={graphQuery.data}
                graphFallback={
                  runQuery.data ? (
                    <JournalWaterfallView run={runQuery.data} />
                  ) : null
                }
                execContext={run?.exec_context as Record<string, unknown> | undefined}
                selectedRunId={focusRunId}
                selectedStepId={selectedStepId}
                onSelectLane={setSelectedRunId}
                onSelectStep={setSelectedStepId}
                secondary={flowchartSecondary}
              />
            )}
          </div>
        ) : null}

        {pane === "journal" ? (
          <div role="tabpanel" aria-label="Journal" className="min-h-0 flex-1 overflow-auto">
            {runQuery.data ? (
              <JournalWaterfallView run={runQuery.data} journalEntries={journalEntries} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {isMeeting
                  ? "No run on this session. New meeting creates a room, not a flow — journal stays empty until a flow binds."
                  : "No journal replay yet."}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
