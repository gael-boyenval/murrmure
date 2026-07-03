import { lazy, Suspense, useMemo } from "react";
import type { GateItem, RunGraphPayload } from "@murrmure/shell-client";
import { GateResolvePanel } from "./GateResolvePanel.js";
import { GateHeader } from "./GateHeader.js";
import { Card, CardContent } from "@murrmure/shell-ui";

const RunFlowchartView = lazy(() =>
  import("./RunFlowchartView.js").then((m) => ({ default: m.RunFlowchartView })),
);

const ORCHESTRATION_APPROVE_CONSEQUENCE =
  "Approving binds this orchestration to the session and enqueues the proposed steps.";

export interface OrchestrationValidateGateProps {
  gate: GateItem;
  graph?: RunGraphPayload;
  onSubmit: (values: { decision: "approved" | "rejected"; form_values: Record<string, unknown> }) => Promise<void>;
  submitting?: boolean;
}

function previewGraphFromGate(gate: GateItem): RunGraphPayload | null {
  const preview = gate.orchestration_preview;
  if (!preview) return null;
  const nodes = preview.steps.map((step, i) => ({
    id: `step:${step.step_id}`,
    step_id: step.step_id,
    kind: step.action === "gate" ? "gate" : "invoke",
    status: "pending" as const,
  }));
  const edges = nodes.slice(1).map((node, i) => ({
    id: `${nodes[i]!.id}->${node.id}`,
    source: nodes[i]!.id,
    target: node.id,
  }));
  return {
    run_id: gate.run_id,
    flow_digest: preview.flow_digest,
    nodes,
    edges,
    lanes: [],
    step_memos: [],
  };
}

export function OrchestrationValidateGate({ gate, graph, onSubmit, submitting }: OrchestrationValidateGateProps) {
  const previewGraph = useMemo(() => graph ?? previewGraphFromGate(gate), [gate, graph]);
  const preview = gate.orchestration_preview;

  return (
    <div className="space-y-4">
      <Card>
        <GateHeader gate={gate} />
        <CardContent className="space-y-4">
          {previewGraph ? (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading preview…</p>}>
              <RunFlowchartView graph={previewGraph} />
            </Suspense>
          ) : null}

          {preview?.steps.length ? (
            <ul className="space-y-2 text-sm">
              {preview.steps.map((step) => (
                <li key={step.step_id} className="rounded-md border border-border px-3 py-2">
                  <div className="font-mono text-xs text-muted-foreground">{step.step_id}</div>
                  {step.space ? <div>Space: {step.space}</div> : null}
                  {step.action ? <div>Action: {step.action}</div> : null}
                  {step.param_shape ? (
                    <div className="text-muted-foreground">
                      Params:{" "}
                      {Object.entries(step.param_shape)
                        .map(([key, type]) => `${key}: ${type}`)
                        .join(", ")}
                    </div>
                  ) : null}
                  {step.expect ? <div className="text-muted-foreground">Expect: {step.expect}</div> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <GateResolvePanel
        gate={gate}
        onSubmit={onSubmit}
        submitting={submitting}
        approveConsequence={ORCHESTRATION_APPROVE_CONSEQUENCE}
        hideHeader
      />
    </div>
  );
}
