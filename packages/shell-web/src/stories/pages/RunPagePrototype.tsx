import { fn } from "@storybook/test";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { GatePanel } from "../../components/GatePanel.js";
import { JournalWaterfallView } from "../../components/JournalWaterfallView.js";
import { RunFlowchartView } from "../../components/RunFlowchartView.js";
import { PrototypeShell } from "../prototype-shell.js";
import {
  failedRun,
  orchestrationGate,
  parallelGraph,
  parallelGraphActive,
  reviewGate,
  workingRun,
} from "../prototype-data.js";

export type RunPagePrototypeState = "working" | "pending-gate" | "orchestration-gate" | "failed";

export function RunPagePrototype({ state }: { state: RunPagePrototypeState }) {
  const run = state === "failed" ? failedRun : workingRun;
  const gate = state === "orchestration-gate" ? orchestrationGate : state === "pending-gate" ? reviewGate : null;
  const flowGraph = state === "failed" ? parallelGraph : parallelGraphActive;

  return (
    <PrototypeShell activePath="/runs/run_8f3a2b">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Run</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-muted-foreground">{run.run_id}</p>
            <Badge variant="outline">{run.lifecycle}</Badge>
            <span className="text-sm text-primary underline">View session</span>
          </div>
        </div>

        {state === "working" || state === "pending-gate" || state === "orchestration-gate" ? (
          <RunFlowchartView graph={flowGraph} selectedRunId="run_c1d4e5" />
        ) : (
          <JournalWaterfallView run={run} onRetry={fn()} />
        )}

        {gate ? (
          <GatePanel gate={gate} graph={flowGraph} onSubmit={fn().mockResolvedValue(undefined)} />
        ) : state === "failed" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No gates on this run.</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <span className="text-primary underline">gate_review_01 — resolved</span>
            </CardContent>
          </Card>
        )}
      </div>
    </PrototypeShell>
  );
}
