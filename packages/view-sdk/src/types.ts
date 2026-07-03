import type { GateForm } from "@murrmure/contracts";

/** Base host routing — always present in view context. */
export interface ViewHostContext {
  flow_id: string;
  space_id: string;
  hub_base_url: string;
  /** Read-only shell token — views must not call orchestration mutation APIs. */
  token: string;
  session_id?: string;
  run_id?: string;
}

/** Optional schema describing expected human response / submit shape (not a form renderer mandate). */
export type ResponseSchema = GateForm;

/** Checkpoint gate block — nested ids only (no top-level gate_id). */
export interface ViewGateContext {
  gate_id: string;
  step_id: string;
  payload_ref?: string;
  responseSchema?: ResponseSchema;
}

/** Full context — shell → view postMessage payload at checkpoint mounts. */
export interface ViewAppContext extends ViewHostContext {
  /** Present at all checkpoint mounts (step 0 + mid-run). */
  gate?: ViewGateContext;
  steps?: Record<string, { output?: Record<string, unknown>; status?: string }>;
  input?: Record<string, unknown>;
}

/** View → host messages (postMessage contract). */
export type ViewHostInboundMessage =
  | { type: "murrmure.view.ready" }
  | { type: "murrmure.view.submit"; params: Record<string, unknown> }
  | { type: "murrmure.view.cancel" };

/** Host → view messages. */
export type ViewHostOutboundMessage = {
  type: "murrmure.view.context";
  context: ViewAppContext;
};

export type ViewHostMessage = ViewHostInboundMessage | ViewHostOutboundMessage;

export const VIEW_HOST_MESSAGE_ORIGIN = "murrmure.view.host";
