import type { ExecutorBinding } from "../ports/indexed-executor-binding.js";

/** VS-5 step contract context passed to shell_spawn at dispatch. */
export interface InvokeStepContractContext {
  slice_json: string;
  contract_path: string;
  workdir: string;
  prompt_bindings: Record<string, string>;
  /** Prompt/discovery scope size; discovery is emitted only when greater than one. */
  contract_key_count?: number;
  run_artifacts_json?: string;
  hub_token?: string;
  hub_url?: string;
}

/**
 * One ordered artifact reference for a remote/federated consumer — never a
 * local path. Remote consumers materialize from the immutable `transfer_id`
 * and verify against `digest`; `name` preserves collection order.
 */
export interface RemoteArtifactFileReference {
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

/**
 * Ordered artifact references for one producer step + slot, relayed across a
 * federation boundary. `cardinality` is carried so the remote consumer binds
 * the correct token shape (singleton `.transfer_id` vs collection directory)
 * without needing the producer's catalog.
 */
export interface RemoteArtifactSlotReference {
  producer_step: string;
  slot: string;
  cardinality: "singleton" | "collection";
  files: RemoteArtifactFileReference[];
}

/**
 * Reference-only step contract relayed through `remote_hub`. None of the
 * fields carry a producer host path, run-scratch path, or local `.path` /
 * `.directory` token: `slice` is sanitized (no `workdir`, reference-only
 * `inputs_from_run`), `artifact_references` and `run_artifacts` drop every
 * `path` field. The destination hub reconstructs a local
 * `InvokeStepContractContext` from this and materializes references in its own
 * space; `hub_token` / `hub_url` let the remote handler fetch bytes from the
 * origin hub when they are not already local.
 */
export interface RemoteStepContractRelay {
  /** Sanitized `StepContractSlice` (no `workdir`; reference-only `inputs_from_run`). */
  slice: Record<string, unknown>;
  /** Ordered artifact references per producer step + slot (no local paths). */
  artifact_references: RemoteArtifactSlotReference[];
  /** Sanitized run artifacts bag (no `path` fields) for `MURRMURE_RUN_ARTIFACTS`. */
  run_artifacts?: Record<string, unknown>;
  contract_key_count?: number;
  hub_token?: string;
  hub_url?: string;
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
