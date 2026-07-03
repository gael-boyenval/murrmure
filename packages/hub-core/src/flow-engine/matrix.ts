import type { FlowIr, FlowStepIr } from "@murrmure/contracts";
import { resolveMatrixValue } from "./templates.js";

export function matrixLaneIdempotencyKey(
  parentRunId: string,
  stepId: string,
  matrixIndex: number,
): string {
  const parent = parentRunId.startsWith("run_") ? parentRunId : `run_${parentRunId}`;
  return `${parent}:${stepId}:${matrixIndex}`;
}

export interface MatrixLanePlan {
  matrix_index: number;
  item: unknown;
  idempotency_key: string;
  lane_steps: FlowStepIr[];
}

export function findParallelStep(ir: FlowIr, stepId: string): FlowStepIr | undefined {
  return ir.steps.find((s) => s.id === stepId && s.kind === "parallel");
}

export function planMatrixExpansion(
  ir: FlowIr,
  stepId: string,
  parentRunId: string,
  execContext: Record<string, unknown>,
): MatrixLanePlan[] | null {
  const step = findParallelStep(ir, stepId);
  if (!step?.parallel) return null;

  const matrix = resolveMatrixValue(step.parallel.matrix, execContext);
  if (!matrix?.length) return null;

  return matrix.map((item, index) => ({
    matrix_index: index,
    item,
    idempotency_key: matrixLaneIdempotencyKey(parentRunId, stepId, index),
    lane_steps: step.parallel!.lane,
  }));
}

export function laneExecContext(
  base: Record<string, unknown>,
  item: unknown,
  matrixIndex: number,
  parentRunId: string,
  matrixStepId: string,
): Record<string, unknown> {
  return {
    ...base,
    item,
    _matrix_index: matrixIndex,
    _parent_run_id: parentRunId,
    _matrix_step_id: matrixStepId,
  };
}

export function isMatrixSiblingRun(execContext: Record<string, unknown>): boolean {
  return typeof execContext._parent_run_id === "string" && typeof execContext._matrix_step_id === "string";
}

export function siblingLaneSteps(execContext: Record<string, unknown>): FlowStepIr[] | undefined {
  const lane = execContext._lane_steps;
  return Array.isArray(lane) ? (lane as FlowStepIr[]) : undefined;
}
