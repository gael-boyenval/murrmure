import {
  VIEW_TRANSPORT_VERSION,
  type ViewAppContext,
  type ViewHostInboundMessage,
  type ViewHostInboundPayload,
  type ViewHostOutboundMessage,
  type ViewMessageEnvelope,
} from "../types.js";

export type ViewContextOutboundMessage = Extract<ViewHostOutboundMessage, { type: "murrmure.view.context" }>;

function isEnvelope(data: unknown): data is ViewMessageEnvelope {
  if (!data || typeof data !== "object") return false;
  const v = data as { v?: unknown; nonce?: unknown };
  return typeof v.v === "number" && typeof v.nonce === "string";
}

export function isViewContextMessage(data: unknown): data is ViewContextOutboundMessage {
  if (!isEnvelope(data)) return false;
  const msg = data as { type?: string; context?: unknown };
  return msg.type === "murrmure.view.context" && msg.context !== null && typeof msg.context === "object";
}

export function isViewHostInboundMessage(data: unknown): data is ViewHostInboundMessage {
  if (!isEnvelope(data)) return false;
  const msg = data as {
    type?: string;
    branch?: unknown;
    input?: unknown;
    submission_id?: unknown;
    child_step_id?: unknown;
    idempotency_key?: unknown;
  };
  switch (msg.type) {
    case "murrmure.view.ready":
    case "murrmure.view.cancel":
    case "murrmure.view.resolved":
      return true;
    case "murrmure.view.cancel_submission":
      return typeof msg.submission_id === "string";
    case "murrmure.view.submit_branch":
      return (
        typeof msg.branch === "string" &&
        typeof msg.submission_id === "string" &&
        typeof msg.input === "object" &&
        msg.input !== null
      );
    case "murrmure.view.open_child":
      return (
        typeof msg.submission_id === "string" &&
        typeof msg.child_step_id === "string" &&
        typeof msg.idempotency_key === "string"
      );
    default:
      return false;
  }
}

export function createViewContextMessage(
  context: ViewAppContext,
  nonce: string,
): ViewContextOutboundMessage {
  return {
    type: "murrmure.view.context",
    v: context.transport_version,
    nonce,
    context,
  };
}

export function createAckMessage(input: {
  nonce: string;
  transport_version: number;
  kind: "submit_branch" | "open_child" | "cancel" | "submission_cancel";
  submission_id?: string;
  ok: true;
}): ViewHostOutboundMessage;
export function createAckMessage(input: {
  nonce: string;
  transport_version: number;
  kind: "submit_branch" | "open_child" | "cancel" | "submission_cancel";
  submission_id?: string;
  ok: false;
  error: import("../types.js").ViewContractError;
}): ViewHostOutboundMessage;
export function createAckMessage(input: {
  nonce: string;
  transport_version: number;
  kind: "submit_branch" | "open_child" | "cancel" | "submission_cancel";
  submission_id?: string;
  ok: boolean;
  error?: import("../types.js").ViewContractError;
}): ViewHostOutboundMessage {
  if (input.ok) {
    return {
      type: "murrmure.view.ack",
      v: input.transport_version,
      nonce: input.nonce,
      kind: input.kind,
      ...(input.submission_id ? { submission_id: input.submission_id } : {}),
      ok: true,
    };
  }
  return {
    type: "murrmure.view.ack",
    v: input.transport_version,
    nonce: input.nonce,
    kind: input.kind,
    ...(input.submission_id ? { submission_id: input.submission_id } : {}),
    ok: false,
    error: input.error!,
  };
}

/** Build a versioned, nonce-bound inbound message to post to the host. */
export function postViewMessage(
  message: ViewHostInboundPayload,
  hubBaseUrl: string,
  nonce: string,
): void {
  const targetOrigin = new URL(hubBaseUrl).origin;
  const envelope: ViewHostInboundMessage = {
    ...message,
    v: VIEW_TRANSPORT_VERSION,
    nonce,
  };
  window.parent.postMessage(envelope, targetOrigin);
}
