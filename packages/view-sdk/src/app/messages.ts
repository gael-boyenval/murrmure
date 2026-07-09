import type {
  ViewAppContext,
  ViewHostInboundMessage,
  ViewHostOutboundMessage,
} from "../types.js";

export function isViewContextMessage(data: unknown): data is ViewHostOutboundMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { type?: string; context?: unknown };
  return msg.type === "murrmure.view.context" && msg.context !== null && typeof msg.context === "object";
}

export function isViewHostInboundMessage(data: unknown): data is ViewHostInboundMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { type?: string };
  return (
    msg.type === "murrmure.view.ready" ||
    msg.type === "murrmure.view.cancel" ||
    msg.type === "murrmure.view.resolved" ||
    (msg.type === "murrmure.view.submit" &&
      typeof (data as { params?: unknown }).params === "object" &&
      (data as { params?: unknown }).params !== null)
  );
}

export function createViewContextMessage(context: ViewAppContext): ViewHostOutboundMessage {
  return { type: "murrmure.view.context", context };
}

export function postViewMessage(message: ViewHostInboundMessage, hubBaseUrl: string): void {
  const targetOrigin = new URL(hubBaseUrl).origin;
  window.parent.postMessage(message, targetOrigin);
}
