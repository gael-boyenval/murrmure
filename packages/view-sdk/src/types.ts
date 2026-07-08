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

/** Active human step block — v2.2 step contract mounts. */
export interface ViewStepContext {
  step_id: string;
  branch_names?: string[];
  contract?: Record<string, unknown>;
}

/** Legacy orchestration gate block (orchestration approval only). */
export interface ViewGateContext {
  gate_id: string;
  step_id: string;
  payload_ref?: string;
  responseSchema?: ResponseSchema;
}

/** Full context — shell → view postMessage payload at checkpoint mounts. */
export interface ViewAppContext extends ViewHostContext {
  /** Legacy orchestration approval mounts only. */
  gate?: ViewGateContext;
  /** v2.2 human step contract mount. */
  step?: ViewStepContext;
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
