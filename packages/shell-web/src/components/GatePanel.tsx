import type { GateItem, RunGraphPayload } from "@murrmure/shell-client";
import { GateResolvePanel } from "./GateResolvePanel.js";
import { OrchestrationValidateGate } from "./OrchestrationValidateGate.js";

export interface GatePanelProps {
  gate: GateItem;
  graph?: RunGraphPayload;
  onSubmit: (values: { decision: "approved" | "rejected"; form_values: Record<string, unknown> }) => Promise<void>;
  submitting?: boolean;
}

export function GatePanel({ gate, graph, onSubmit, submitting }: GatePanelProps) {
  if (gate.step_id === "orchestration:proposed" || gate.orchestration_preview) {
    return (
      <OrchestrationValidateGate gate={gate} graph={graph} onSubmit={onSubmit} submitting={submitting} />
    );
  }
  return <GateResolvePanel gate={gate} onSubmit={onSubmit} submitting={submitting} />;
}
