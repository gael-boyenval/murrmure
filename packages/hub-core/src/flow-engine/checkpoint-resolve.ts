import type { FlowIr, FlowStepIr } from "@murrmure/contracts";
import { planLinearSteps } from "./plan.js";

export type FlowCheckpointOnResolve = NonNullable<NonNullable<FlowStepIr["gate"]>["on_resolve"]>;

export type OnResolveRoute = { goto?: string; fail?: boolean };

export const CHECKPOINT_BRANCH_MAX_DEPTH = 32;

function readFieldPath(root: Record<string, unknown>, path: string): unknown {
  const normalized = path.startsWith("output.") ? path.slice("output.".length) : path;
  return normalized.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

function isExplicitRoute(route: OnResolveRoute | undefined): route is OnResolveRoute {
  if (!route) return false;
  if (route.fail === true) return true;
  return typeof route.goto === "string" && route.goto.length > 0;
}

/** Resolve on_resolve branch for a checkpoint resolve (decision 04/06). */
export function planOnResolveBranch(
  onResolve: FlowCheckpointOnResolve | undefined,
  disposition: "continue" | "cancel",
  output: Record<string, unknown>,
): OnResolveRoute | null {
  if (!onResolve) return null;

  if (disposition === "cancel") {
    return isExplicitRoute(onResolve.cancel) ? onResolve.cancel : null;
  }

  if (onResolve.when && onResolve.values) {
    const key = readFieldPath(output, onResolve.when);
    if (key !== undefined && key !== null) {
      const match = onResolve.values[String(key)];
      if (isExplicitRoute(match)) return match;
    }
  }

  return isExplicitRoute(onResolve.default) ? onResolve.default : null;
}

export function checkpointStepIndex(ir: FlowIr, step_id: string): number {
  return planLinearSteps(ir).findIndex((s) => s.id === step_id);
}

export function checkpointStep(ir: FlowIr, step_id: string): FlowStepIr | undefined {
  return planLinearSteps(ir).find((s) => s.id === step_id);
}

export function stepsFromGoto(ir: FlowIr, gotoStepId: string): string[] {
  const plan = planLinearSteps(ir);
  const targetIdx = plan.findIndex((s) => s.id === gotoStepId);
  if (targetIdx < 0) return [];
  return plan.slice(targetIdx).map((s) => s.id);
}

export function nextBranchDepth(execContext: Record<string, unknown>): number {
  const current = Number(execContext._checkpoint_branch_depth ?? 0);
  return current + 1;
}

/** True when goto targets an earlier step (loop-back cycle detection). */
export function isBackwardGoto(currentStepIndex: number, gotoStepIndex: number): boolean {
  return gotoStepIndex >= 0 && gotoStepIndex < currentStepIndex;
}
