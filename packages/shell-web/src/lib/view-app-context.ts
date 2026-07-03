import type { ViewAppContext } from "@murrmure/view-sdk";
import type { GateItem } from "@murrmure/shell-client";

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
  gate: Pick<GateItem, "gate_id" | "step_id" | "payload_ref" | "form">;
  exec_context?: Record<string, unknown>;
}

/** Build ViewAppContext for ViewCanvasHost from run + pending gate (decision 03). */
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
    gate: {
      gate_id: input.gate.gate_id,
      step_id: input.gate.step_id,
      payload_ref: input.gate.payload_ref,
      ...(input.gate.form ? { responseSchema: input.gate.form } : {}),
    },
    ...(steps ? { steps } : {}),
    ...(runInput ? { input: runInput } : {}),
  };
}
