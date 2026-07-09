import type { ViewAppContext, ViewHostInboundMessage } from "./types.js";
import { createViewContextMessage, isViewHostInboundMessage } from "./app/messages.js";
import { hubOriginsMatch } from "./hub-origin.js";
import { resolveViewIframeOrigin } from "./iframe-origin.js";

export { createViewContextMessage, isViewHostInboundMessage } from "./app/messages.js";
export { resolveViewIframeOrigin } from "./iframe-origin.js";

/** Resolve relative view entry paths to hub-served asset URLs. */
export function resolveViewEntryUrl(
  hubBaseUrl: string,
  viewRef: { view_id: string; origin_space_id: string; entry_url?: string },
): string | undefined {
  if (!viewRef.entry_url) return undefined;
  const base = hubBaseUrl.replace(/\/$/, "");
  const entry = viewRef.entry_url.replace(/^\.\//, "");
  const spaceId = encodeURIComponent(viewRef.origin_space_id);
  const viewId = encodeURIComponent(viewRef.view_id);
  return `${base}/v1/spaces/${spaceId}/views/${viewId}/${entry.split("/").map(encodeURIComponent).join("/")}`;
}

export interface ViewHostBridgeHandlers {
  onReady?: () => void;
  onSubmit?: (params: Record<string, unknown>) => void;
  onCancel?: () => void;
  onResolved?: () => void;
}

/** Attach postMessage listener for view iframe protocol. Returns cleanup. */
export function attachViewHostBridge(
  iframe: HTMLIFrameElement,
  context: ViewAppContext,
  handlers: ViewHostBridgeHandlers,
): () => void {
  const iframeOrigin = resolveViewIframeOrigin(iframe, context.hub_base_url);
  const hubBaseUrl = context.hub_base_url;

  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.origin !== iframeOrigin && !hubOriginsMatch(event.origin, hubBaseUrl)) return;
    if (!isViewHostInboundMessage(event.data)) return;

    switch ((event.data as ViewHostInboundMessage).type) {
      case "murrmure.view.ready":
        handlers.onReady?.();
        break;
      case "murrmure.view.submit":
        handlers.onSubmit?.((event.data as { params: Record<string, unknown> }).params);
        break;
      case "murrmure.view.cancel":
        handlers.onCancel?.();
        break;
      case "murrmure.view.resolved":
        handlers.onResolved?.();
        break;
    }
  };

  window.addEventListener("message", onMessage);

  const sendContext = () => {
    iframe.contentWindow?.postMessage(createViewContextMessage(context), iframeOrigin);
  };

  iframe.addEventListener("load", sendContext);
  sendContext();

  return () => {
    window.removeEventListener("message", onMessage);
    iframe.removeEventListener("load", sendContext);
  };
}
