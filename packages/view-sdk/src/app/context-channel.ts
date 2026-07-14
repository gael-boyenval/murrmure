import type { ViewAppContext } from "../types.js";
import { hubOriginsMatch } from "../hub-origin.js";
import { isViewContextMessage } from "./messages.js";

export { resolveHubOrigin } from "../hub-origin.js";

type ContextListener = (context: ViewAppContext) => void;

let pendingContext: ViewAppContext | null = null;
let channelWired = false;
const subscribers = new Set<ContextListener>();

/** Trust gate for an inbound host context message:
 * - exact parent window source;
 * - versioned + nonce-bound envelope;
 * - envelope nonce matches the context nonce and envelope v matches the
 *   context transport version (message binds to this mount);
 * - origin matches the Hub base URL declared in the context. */
export function isTrustedViewContextMessage(event: MessageEvent): boolean {
  if (event.source !== window.parent) return false;
  if (!isViewContextMessage(event.data)) return false;
  const envelope = event.data;
  const context = envelope.context;
  if (envelope.v !== context.transport_version) return false;
  if (envelope.nonce !== context.nonce) return false;
  return hubOriginsMatch(event.origin, context.hub_base_url);
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
