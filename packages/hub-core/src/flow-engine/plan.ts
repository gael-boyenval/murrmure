import type { FlowIr, FlowStepIr } from "@murrmure/contracts";

/** Linear executable steps — invoke, gate, start_flow, and top-level step_contract. */
export function planLinearSteps(ir: FlowIr): FlowStepIr[] {
  return ir.steps.filter(
    (s) =>
      s.kind === "invoke" ||
      s.kind === "gate" ||
      s.kind === "start_flow" ||
      s.kind === "step_contract",
  );
}

export function firstDispatchableStep(ir: FlowIr): FlowStepIr | undefined {
  return planLinearSteps(ir)[0];
}
