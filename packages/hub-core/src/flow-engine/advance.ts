import type { FlowIr, RunStepMemo } from "@murrmure/contracts";
import type { FlowStepDispatch } from "./types.js";
import { planLinearSteps } from "./plan.js";
import { buildCheckpointDispatch } from "./checkpoint-dispatch.js";
import { resolveStepParams, resolveStepSpace } from "./templates.js";

export function activeStepIndex(memos: RunStepMemo[], ir: FlowIr): number {
  const plan = planLinearSteps(ir);
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]!;
    const memo = memos.find((m) => m.step_id === step.id);
    if (!memo || memo.status === "pending" || memo.status === "working") {
      return i;
    }
    if (memo.status === "failed") return i;
  }
  return plan.length;
}

export function isRunPlanComplete(memos: RunStepMemo[], ir: FlowIr): boolean {
  return activeStepIndex(memos, ir) >= planLinearSteps(ir).length;
}

export function buildStepDispatch(
  ir: FlowIr,
  stepIndex: number,
  execContext: Record<string, unknown>,
  originSpaceId: string,
): FlowStepDispatch | null {
  const plan = planLinearSteps(ir);
  const step = plan[stepIndex];
  if (!step || step.kind !== "invoke" || !step.invoke) return null;

  const space_id = resolveStepSpace(step.invoke.space, originSpaceId);
  const params = resolveStepParams(step.invoke.params, execContext);

  return {
    step_id: step.id,
    space_id,
    action_name: step.invoke.action,
    params,
  };
}

export function nextDispatchAfterComplete(
  memos: RunStepMemo[],
  ir: FlowIr,
  execContext: Record<string, unknown>,
  originSpaceId: string,
): FlowStepDispatch | null {
  const idx = activeStepIndex(memos, ir);
  if (idx >= planLinearSteps(ir).length) return null;
  const plan = planLinearSteps(ir);
  const step = plan[idx];
  if (step?.kind === "gate") return null;
  if (step?.kind !== "invoke") return null;
  const memo = memos.find((m) => m.step_id === step.id);
  if (memo && memo.status !== "pending") return null;
  return buildStepDispatch(ir, idx, execContext, originSpaceId);
}

export function nextCheckpointAfterComplete(
  memos: RunStepMemo[],
  ir: FlowIr,
  execContext: Record<string, unknown>,
) {
  const idx = activeStepIndex(memos, ir);
  if (idx >= planLinearSteps(ir).length) return null;
  const plan = planLinearSteps(ir);
  const step = plan[idx];
  if (step?.kind !== "gate") return null;
  const memo = memos.find((m) => m.step_id === step.id);
  if (memo && memo.status !== "pending") return null;
  return buildCheckpointDispatch(ir, idx, execContext);
}
