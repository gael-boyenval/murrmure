import type { FlowIr, FlowStepIr } from "@murrmure/contracts";
import { resolveTemplateString } from "./templates.js";
import { planLinearSteps } from "./plan.js";

export interface FlowCheckpointDispatch {
  step_id: string;
  step_index: number;
  view_id: string;
  assignees?: string[];
  payload_ref?: string;
  merge_input?: boolean;
}

/** Declarative checkpoint gates require view + on_resolve routing (not legacy form gates). */
export function isDeclarativeCheckpointStep(step: FlowStepIr | undefined): boolean {
  if (!step || step.kind !== "gate" || !step.gate) return false;
  const view_id = step.gate.view_id ?? step.gate.view_ref?.view_id;
  return Boolean(view_id && step.gate.on_resolve);
}

export function buildCheckpointDispatch(
  ir: FlowIr,
  stepIndex: number,
  execContext: Record<string, unknown>,
): FlowCheckpointDispatch | null {
  const plan = planLinearSteps(ir);
  const step = plan[stepIndex];
  if (!step || step.kind !== "gate" || !step.gate) return null;

  const view_id = step.gate.view_id ?? step.gate.view_ref?.view_id;
  if (!view_id) return null;

  const assignees = step.gate.assignees?.map((a) => resolveTemplateString(a, execContext));
  let payload_ref: string | undefined;
  if (step.gate.payload_ref) {
    const resolved = resolveTemplateString(step.gate.payload_ref, execContext);
    if (resolved) payload_ref = resolved;
  }

  return {
    step_id: step.id,
    step_index: stepIndex,
    view_id,
    assignees: assignees?.length ? assignees : undefined,
    payload_ref,
    merge_input: step.gate.merge_input,
  };
}

export function pendingCheckpointAtIndex(
  memos: Array<{ step_id: string; status: string }>,
  ir: FlowIr,
  stepIndex: number,
): FlowStepIr | null {
  const plan = planLinearSteps(ir);
  const step = plan[stepIndex];
  if (!step || step.kind !== "gate") return null;
  const memo = memos.find((m) => m.step_id === step.id);
  if (memo && memo.status !== "pending") return null;
  return step;
}
