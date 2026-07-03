import type { FlowIr, FlowStepIr } from "@murrmure/contracts";

/** Linear executable steps — invoke, gate, and start_flow. */
export function planLinearSteps(ir: FlowIr): FlowStepIr[] {
  return ir.steps.filter(
    (s) => s.kind === "invoke" || s.kind === "gate" || s.kind === "start_flow",
  );
}

export function firstDispatchableStep(ir: FlowIr): FlowStepIr | undefined {
  return planLinearSteps(ir)[0];
}
