import type { ViewAppContext } from "../types.js";
import { hubOriginsMatch, resolveHubOrigin } from "../hub-origin.js";
import { isViewContextMessage } from "./messages.js";

export { resolveHubOrigin } from "../hub-origin.js";

type ContextListener = (context: ViewAppContext) => void;

let pendingContext: ViewAppContext | null = null;
let channelWired = false;
const subscribers = new Set<ContextListener>();

export function isTrustedViewContextMessage(event: MessageEvent): boolean {
  if (event.source !== window.parent) return false;
  if (!isViewContextMessage(event.data)) return false;
  return hubOriginsMatch(event.origin, event.data.context.hub_base_url);
}

/** Register the view context listener before React mounts so early host posts are not missed. */
export function ensureViewContextChannel(): void {
  if (channelWired) return;
  channelWired = true;

  window.addEventListener("message", (event: MessageEvent) => {
    if (!isTrustedViewContextMessage(event)) return;
    if (!isViewContextMessage(event.data)) return;
    pendingContext = event.data.context;
    for (const listener of subscribers) {
      listener(event.data.context);
    }
  });
}

export function peekPendingViewContext(): ViewAppContext | null {
  return pendingContext;
}

export function subscribeViewContext(listener: ContextListener): () => void {
  subscribers.add(listener);
  if (pendingContext) {
    listener(pendingContext);
  }
  return () => {
    subscribers.delete(listener);
  };
}

/** Test-only reset. */
export function resetViewContextChannelForTests(): void {
  pendingContext = null;
  channelWired = false;
  subscribers.clear();
}
