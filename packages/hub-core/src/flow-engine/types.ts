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

export interface FlowStartError {
  code: string;
  message: string;
  /** Populated when `code === "FLOW_CONCURRENCY_LIMIT"` (run-capacity denial). */
  flow_id?: string;
  flow_name?: string;
  origin_space_id?: string;
  flow_digest?: string;
  max_concurrent_runs?: number;
  active_run_ids?: string[];
}
