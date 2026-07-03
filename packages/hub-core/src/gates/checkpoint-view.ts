import type { FlowIr, FlowViewRef } from "@murrmure/contracts";

/** Resolve denormalized view_ref for a pending checkpoint gate from flow IR. */
export function resolveCheckpointViewRef(
  ir: FlowIr | null | undefined,
  step_id: string,
): FlowViewRef | undefined {
  if (!ir) return undefined;
  const step = ir.steps.find((s) => s.id === step_id);
  if (!step?.gate) return undefined;
  return step.gate.view_ref;
}
