import type { ViewAppContext } from "@murrmure/view-sdk";
import type { RunDetailPayload } from "@murrmure/shell-client";

export interface ViewRefLike {
  view_id: string;
  origin_space_id?: string;
  entry_url?: string;
  shell_route?: string;
}

export interface BuildViewAppContextInput {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  token: string;
  session_id?: string;
  run_id?: string;
  step_id: string;
  branch_names?: string[];
  exec_context?: Record<string, unknown>;
}

/** Build ViewAppContext for ViewCanvasHost from run + active human step (v2.2). */
export function buildViewAppContext(input: BuildViewAppContextInput): ViewAppContext {
  const exec = input.exec_context ?? {};
  const stepsRaw = exec.steps;
  const steps =
    stepsRaw && typeof stepsRaw === "object" && !Array.isArray(stepsRaw)
      ? (stepsRaw as Record<string, { output?: Record<string, unknown>; status?: string }>)
      : undefined;
  const runInput =
    exec.input && typeof exec.input === "object" && !Array.isArray(exec.input)
      ? (exec.input as Record<string, unknown>)
      : undefined;

  return {
    flow_id: input.flow_id,
    space_id: input.space_id,
    hub_base_url: input.hub_base_url,
    token: input.token,
    session_id: input.session_id,
    run_id: input.run_id,
    step: {
      step_id: input.step_id,
      branch_names: input.branch_names,
    },
    ...(steps ? { steps } : {}),
    ...(runInput ? { input: runInput } : {}),
  };
}

export function buildViewAppContextFromRun(
  run: RunDetailPayload,
  input: {
    hub_base_url: string;
    token: string;
    flow_id: string;
    space_id: string;
  },
): ViewAppContext | null {
  const active = run.open_steps?.[0];
  if (!active) return null;
  return buildViewAppContext({
    flow_id: input.flow_id,
    space_id: input.space_id,
    hub_base_url: input.hub_base_url,
    token: input.token,
    session_id: run.session_id,
    run_id: run.run_id,
    step_id: active.step_id,
    branch_names: active.branches.map((b) => b.branch),
    exec_context: run.exec_context,
  });
}
