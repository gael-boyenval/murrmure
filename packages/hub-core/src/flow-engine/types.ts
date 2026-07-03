export type {
  FlowIr,
  FlowStepIr,
  FlowStepKind,
  FlowManifest,
  FlowIndexEntry,
  FlowStartConditions,
} from "@murrmure/contracts";

export interface FlowStepDispatch {
  step_id: string;
  space_id: string;
  action_name: string;
  params?: Record<string, unknown>;
}

export interface FlowStartResult {
  session_id: string;
  run_id: string;
  flow_id: string;
  flow_digest: string;
  dispatch: FlowStepDispatch[];
}

export type FlowStartError = { code: string; message: string };
