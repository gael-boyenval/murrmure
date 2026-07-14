import type { GateForm } from "@murrmure/contracts";

/** Wire/transport version for the host ↔ view postMessage protocol. */
export const VIEW_TRANSPORT_VERSION = 1;

/** Base host routing — always present in view context. No token: views never
 * hold a Hub credential and must not call orchestration mutation APIs directly;
 * submission is host-mediated via `submitBranch`. */
export interface ViewHostContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  session_id?: string;
  run_id?: string;
  /** Execution mode. Dev never uploads, resolves, or mutates a real run. */
  mode: "production" | "dev";
  /** Transport version of this context/message stream. */
  transport_version: number;
  /** Per-instance nonce binding every message to this mount. */
  nonce: string;
}

/** Optional schema describing expected human response / submit shape (not a form renderer mandate). */
export type ResponseSchema = GateForm;

/** One canonical branch resolve contract projected from the server. */
export interface ViewBranchArtifactSlot {
  description?: string;
  media_types?: string[];
  extensions?: string[];
  min_bytes?: number;
  max_bytes?: number;
}

export interface ViewBranchContract {
  branch: string;
  schema_ref?: string;
  schema?: Record<string, unknown>;
  /** Per-branch artifact slots (Task 05 owns formal catalog slots). */
  artifact_slots?: Record<string, ViewBranchArtifactSlot>;
}

/** Active human step block — v3 step contract mount. `branches` is a server
 * projection of canonical branch contracts; clients do not reconstruct or merge. */
export interface ViewStepContext {
  step_id: string;
  branches: ViewBranchContract[];
  contract?: Record<string, unknown>;
}

/** Legacy orchestration gate block (orchestration approval only). */
export interface ViewGateContext {
  gate_id: string;
  step_id: string;
  payload_ref?: string;
  responseSchema?: ResponseSchema;
}

/** Full context — shell → view postMessage payload. */
export interface ViewAppContext extends ViewHostContext {
  /** Legacy orchestration approval mounts only. */
  gate?: ViewGateContext;
  /** v3 human step contract mount. */
  step?: ViewStepContext;
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  input?: Record<string, unknown>;
}

/** Typed error returned by `submitBranch` / `cancel` when the host rejects an intent. */
export interface ViewContractError {
  code:
    | "VIEW_INVALID_BRANCH"
    | "VIEW_BRANCH_VALIDATION_FAILED"
    | "VIEW_UNKNOWN_BRANCH"
    | "VIEW_CANCEL_REJECTED"
    | "VIEW_CONTEXT_MISMATCH"
    | (string & {});
  message: string;
  branch?: string;
}

export function isViewContractError(value: unknown): value is ViewContractError {
  if (!value || typeof value !== "object") return false;
  const v = value as { code?: unknown; message?: unknown };
  return typeof v.code === "string" && typeof v.message === "string";
}

/** Common envelope fields binding a message to its transport version + mount nonce. */
export interface ViewMessageEnvelope {
  v: number;
  nonce: string;
}

/** Inbound payload without the envelope — what views post to the host. */
export type ViewHostInboundPayload =
  | { type: "murrmure.view.ready" }
  | { type: "murrmure.view.submit_branch"; branch: string; params: Record<string, unknown> }
  | { type: "murrmure.view.cancel" }
  | { type: "murrmure.view.resolved" };

/** View → host messages (postMessage contract). */
export type ViewHostInboundMessage = ViewHostInboundPayload & ViewMessageEnvelope;

/** Host → view messages. */
export type ViewHostOutboundMessage =
  | (ViewMessageEnvelope & { type: "murrmure.view.context"; context: ViewAppContext })
  | (ViewMessageEnvelope & {
      type: "murrmure.view.ack";
      ok: true;
      kind: "submit_branch" | "cancel";
    })
  | (ViewMessageEnvelope & {
      type: "murrmure.view.ack";
      ok: false;
      kind: "submit_branch" | "cancel";
      error: ViewContractError;
    });

export type ViewHostMessage = ViewHostInboundMessage | ViewHostOutboundMessage;

export const VIEW_HOST_MESSAGE_ORIGIN = "murrmure.view.host";
