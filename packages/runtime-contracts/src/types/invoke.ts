import type { ExecutorBinding } from "../ports/indexed-executor-binding.js";

/** VS-5 step contract context passed to shell_spawn at dispatch. */
export interface InvokeStepContractContext {
  slice_json: string;
  contract_path: string;
  workdir: string;
  prompt_bindings: Record<string, string>;
  run_artifacts_json?: string;
}

/** Shared invoke wire types (rev-1 §4.4). */
export interface InvokeExpect {
  response_schema?: string;
}

/** Action + binding context passed to executor adapters at dispatch time. */
/** Resolved shell command + prompt recorded at dispatch for operator debugging. */
export interface DispatchAudit {
  command: string;
  prompt: string;
  cwd: string;
}

export interface DispatchContext {
  action: {
    name: string;
    command?: string;
    prompt?: string;
    cwd?: string;
    timeout_ms?: number;
    response_schema?: string;
  };
  binding: ExecutorBinding;
  space_root?: string;
  /** Shallow copy of `exec_context.input` for shell_spawn `MURRMURE_INPUT`. */
  exec_input?: Record<string, unknown>;
  /** VS-5 step contract injection for shell_spawn. */
  step_contract?: InvokeStepContractContext;
}

export interface InvokeRequest {
  space_id: string;
  action_name: string;
  session_id?: string;
  run_id?: string;
  step_id?: string;
  params?: Record<string, unknown>;
  /** Run input bag — passed to executors as `MURRMURE_INPUT`. */
  exec_input?: Record<string, unknown>;
  expect?: InvokeExpect;
  artifacts_in?: string[];
  delivery?: "fail_fast" | "queue_until_executor";
  idempotency_key?: string;
  /** VS-5 step contract injection for shell_spawn. */
  step_contract?: InvokeStepContractContext;
}

export type DispatchStatus =
  | "dispatched"
  | "completed"
  | "queued"
  | "failed"
  | "executor_unavailable";

export interface DispatchOutcome {
  status: DispatchStatus;
  run_id?: string;
  step_id?: string;
  result?: Record<string, unknown>;
  error_code?: string;
  detail?: string;
}

export interface InvokeResponse {
  dispatch: DispatchOutcome;
  /** Present when executor returns synchronously with a validated body. */
  body?: Record<string, unknown>;
}
