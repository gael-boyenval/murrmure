import type { ExecutorBinding } from "../ports/indexed-executor-binding.js";

/** Shared invoke wire types (rev-1 §4.4). */
export interface InvokeExpect {
  response_schema?: string;
}

/** Action + binding context passed to executor adapters at dispatch time. */
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
