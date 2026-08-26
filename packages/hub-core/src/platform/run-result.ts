import { DIRECTIVE_STEP_ID } from "./directive.js";

export type RunStepResult = {
  step_id: string;
  status?: string;
  message?: string;
};

function stepRecord(
  value: unknown,
): { status?: string; output?: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as { status?: string; output?: Record<string, unknown> };
}

/** Prefer the directive `execute` step; otherwise the last step that has a message. */
export function extractRunStepResult(
  exec_context: Record<string, unknown> | undefined,
): RunStepResult | undefined {
  if (!exec_context) return undefined;
  const steps = exec_context.steps;
  if (!steps || typeof steps !== "object" || Array.isArray(steps)) return undefined;
  const map = steps as Record<string, unknown>;

  const preferred = stepRecord(map[DIRECTIVE_STEP_ID]);
  if (preferred) {
    const message =
      typeof preferred.output?.message === "string" ? preferred.output.message : undefined;
    return {
      step_id: DIRECTIVE_STEP_ID,
      status: typeof preferred.status === "string" ? preferred.status : undefined,
      message,
    };
  }

  for (const [step_id, raw] of Object.entries(map)) {
    const record = stepRecord(raw);
    if (typeof record?.output?.message !== "string") continue;
    return {
      step_id,
      status: typeof record.status === "string" ? record.status : undefined,
      message: record.output.message,
    };
  }
  return undefined;
}
