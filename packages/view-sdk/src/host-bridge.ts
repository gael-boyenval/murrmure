import type {
  ViewAppContext,
  ViewContractError,
  ViewHostInboundMessage,
  ViewHostOutboundMessage,
} from "./types.js";
import { createViewContextMessage, createAckMessage, isViewHostInboundMessage } from "./app/messages.js";
import { hubOriginsMatch } from "./hub-origin.js";
import { isSandboxedOpaqueOrigin, resolveViewIframeOrigin, resolveViewIframeTargetOrigin } from "./iframe-origin.js";

export { createViewContextMessage, createAckMessage, isViewHostInboundMessage } from "./app/messages.js";
export { resolveViewIframeOrigin, isSandboxedOpaqueOrigin, resolveViewIframeTargetOrigin } from "./iframe-origin.js";

/** Resolve relative view entry paths to hub-served asset URLs. External View
 * URLs are rejected — production Views are locally built and shell-hosted. */
export function resolveViewEntryUrl(
  hubBaseUrl: string,
  viewRef: { view_id: string; origin_space_id: string; entry_url?: string },
): string | undefined {
  if (!viewRef.entry_url) return undefined;
  if (/^https?:\/\//i.test(viewRef.entry_url) || viewRef.entry_url.startsWith("//")) {
    throw new Error("External View URLs are rejected; production Views are locally built and shell-hosted");
  }
  const base = hubBaseUrl.replace(/\/$/, "");
  const entry = viewRef.entry_url.replace(/^\.\//, "");
  const spaceId = encodeURIComponent(viewRef.origin_space_id);
  const viewId = encodeURIComponent(viewRef.view_id);
  return `${base}/v1/spaces/${spaceId}/views/${viewId}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}

export interface ViewHostBridgeHandlers {
  onReady?: () => void;
  onSubmitBranch?: (branch: string, params: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: ViewContractError }>;
  onCancel?: () => Promise<{ ok: true } | { ok: false; error: ViewContractError }>;
  onResolved?: () => void;
}

/** True when an inbound message binds the exact source window, transport version,
 * and per-instance nonce of this mount. */
function isMatchingInbound(
  event: MessageEvent,
  iframe: HTMLIFrameElement,
  context: ViewAppContext,
): event is MessageEvent & { data: ViewHostInboundMessage } {
  if (event.source !== iframe.contentWindow) return false;
  if (!isViewHostInboundMessage(event.data)) return false;
  const msg = event.data as ViewHostInboundMessage;
  return msg.v === context.transport_version && msg.nonce === context.nonce;
}

/** Attach postMessage listener for the versioned, nonce-bound view protocol. Returns cleanup. */
export function attachViewHostBridge(
  iframe: HTMLIFrameElement,
  context: ViewAppContext,
  handlers: ViewHostBridgeHandlers,
): () => void {
  const iframeOrigin = resolveViewIframeOrigin(iframe, context.hub_base_url);
  const hubBaseUrl = context.hub_base_url;
  // Sandboxed opaque-origin iframes (allow-scripts without allow-same-origin)
  // arrive with event.origin === "null" and can only be reached via "*". The
  // nonce-bound envelope and exact source-window binding remain the trust gate.
  const opaque = isSandboxedOpaqueOrigin(iframe);
  const targetOrigin = resolveViewIframeTargetOrigin(iframe, hubBaseUrl);

  const onMessage = async (event: MessageEvent) => {
    if (opaque) {
      if (event.origin !== "null") return;
    } else if (event.origin !== iframeOrigin && !hubOriginsMatch(event.origin, hubBaseUrl)) {
      return;
    }
    if (!isMatchingInbound(event, iframe, context)) return;
    const message = event.data as ViewHostInboundMessage;

    switch (message.type) {
      case "murrmure.view.ready":
        handlers.onReady?.();
        break;
      case "murrmure.view.submit_branch": {
        const result = handlers.onSubmitBranch
          ? await handlers.onSubmitBranch(message.branch, message.params)
          : ({ ok: true } as const);
        const ack = result.ok
          ? createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "submit_branch",
              ok: true,
            })
          : createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "submit_branch",
              ok: false,
              error: result.error,
            });
        iframe.contentWindow?.postMessage(ack, targetOrigin);
        break;
      }
      case "murrmure.view.cancel": {
        const result = handlers.onCancel ? await handlers.onCancel() : ({ ok: true } as const);
        const ack = result.ok
          ? createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "cancel",
              ok: true,
            })
          : createAckMessage({
              nonce: context.nonce,
              transport_version: context.transport_version,
              kind: "cancel",
              ok: false,
              error: result.error,
            });
        iframe.contentWindow?.postMessage(ack, targetOrigin);
        break;
      }
      case "murrmure.view.resolved":
        handlers.onResolved?.();
        break;
    }
  };

  window.addEventListener("message", onMessage);

  const sendContext = () => {
    iframe.contentWindow?.postMessage(
      createViewContextMessage(context, context.nonce) as ViewHostOutboundMessage,
      targetOrigin,
    );
  };

  iframe.addEventListener("load", sendContext);
  sendContext();

  return () => {
    window.removeEventListener("message", onMessage);
    iframe.removeEventListener("load", sendContext);
  };
}
