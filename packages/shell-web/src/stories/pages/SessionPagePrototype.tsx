import { useState } from "react";
import { Link } from "react-router-dom";
import { fn } from "@storybook/test";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { GatePanel } from "../../components/GatePanel.js";
import { RunFlowchartView } from "../../components/RunFlowchartView.js";
import {
  SessionLaneDetailPanel,
  type SessionLaneDetail,
} from "../../components/SessionLaneDetailPanel.js";
import { SessionStatusBadge } from "../../components/session-status-badge.js";
import { PrototypeShell } from "../prototype-shell.js";
import {
  parallelGraph,
  parallelGraphActive,
  reviewGate,
  sessionRunsFailed,
  sessionRunsWorking,
  type SessionRunFixture,
} from "../prototype-data.js";

export type SessionPagePrototypeState = "working" | "gate-open" | "failed";

function toLaneDetail(run: SessionRunFixture | undefined): SessionLaneDetail | undefined {
  if (!run) return undefined;
  return {
    run_id: run.run_id,
    lifecycle: run.lifecycle,
    label: run.title,
    space_label: run.space_label,
    error_summary: run.error_summary,
    last_step: run.last_step,
    started_at: run.started_at,
  };
}

export function SessionPagePrototype({ state }: { state: SessionPagePrototypeState }) {
  const isFailed = state === "failed";
  const sessionRuns = isFailed ? sessionRunsFailed : sessionRunsWorking;
  const graph = isFailed ? parallelGraph : parallelGraphActive;
  const defaultRunId = isFailed ? "run_fail99" : "run_c1d4e5";
  const [selectedRunId, setSelectedRunId] = useState(defaultRunId);
  const focusRunId = selectedRunId;
  const showGate = state === "gate-open";
  const sessionStatus = isFailed ? "partial_failure" : "active";

  const focusedRun = sessionRuns.find((r) => r.run_id === focusRunId);
  const laneDetail = toLaneDetail(focusedRun);
  const canRetry = focusedRun?.lifecycle === "failed" || focusedRun?.lifecycle === "cancelled";
  const logsHref = `/logs?session=ses_review_loop${focusRunId ? `&run=${focusRunId}` : ""}`;

  return (
    <PrototypeShell activePath="/sessions/ses_review_loop">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Review loop session</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-muted-foreground">ses_review_loop</p>
              <SessionStatusBadge status={sessionStatus} />
            </div>
          </div>

          <RunFlowchartView
            graph={graph}
            selectedRunId={focusRunId}
            onSelectLane={setSelectedRunId}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sessionRuns.map((run) => (
                <button
                  key={run.run_id}
                  type="button"
                  className={`block w-full rounded-md border px-3 py-2 text-left ${
                    run.run_id === focusRunId ? "border-primary bg-muted/40" : "border-border"
                  }`}
                  onClick={() => setSelectedRunId(run.run_id)}
                >
                  <span className="font-medium">{run.title}</span>
                  <span className="ml-2 font-mono text-muted-foreground">{run.run_id}</span>
                  <Badge className="ml-2" variant="outline">
                    {run.lifecycle}
                  </Badge>
                  {run.error_summary ? (
                    <p className="mt-1 truncate text-xs text-red-300">{run.error_summary}</p>
                  ) : null}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="w-full shrink-0 space-y-4 lg:w-96">
          <SessionLaneDetailPanel
            lane={laneDetail}
            onRetry={canRetry ? fn() : undefined}
          />

          {showGate ? (
            <GatePanel gate={reviewGate} graph={graph} onSubmit={fn().mockResolvedValue(undefined)} />
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
    </PrototypeShell>
  );
}
