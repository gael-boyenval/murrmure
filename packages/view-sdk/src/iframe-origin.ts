/**
 * Resolve postMessage target/check origin for a view iframe.
 *
 * Production iframes load hub-served `dist/` assets (hub origin). Dev iframes load
 * the author's Vite server (e.g. localhost:5173) while `hub_base_url` stays the hub
 * token origin — see studio-specs/plans/product/plan/decisions/02-view-dev-loop.md.
 *
 * Note: this returns the `src` origin, which is only the effective origin when the
 * iframe is NOT sandboxed to an opaque origin. For sandboxed opaque iframes use
 * {@link isSandboxedOpaqueOrigin} and {@link resolveViewIframeTargetOrigin}.
 */
export function resolveViewIframeOrigin(iframe: HTMLIFrameElement, hubBaseUrl: string): string {
  if (iframe.src) {
    try {
      return new URL(iframe.src, window.location.href).origin;
    } catch {
      // fall through to hub origin
    }
  }
  return new URL(hubBaseUrl).origin;
}

/**
 * True when the iframe is sandboxed without `allow-same-origin`, so its effective
 * origin is opaque and serializes to the string "null" on `MessageEvent.origin`.
 *
 * `ViewHostFrame` always sets `sandbox="allow-scripts"` (no `allow-same-origin`) to
 * keep the embedded View off the Hub's credential/storage origin. An opaque-origin
 * iframe cannot be addressed by its `src` origin for `postMessage`, and its inbound
 * messages arrive with `event.origin === "null"` rather than the `src` origin.
 */
export function isSandboxedOpaqueOrigin(iframe: HTMLIFrameElement): boolean {
  const attr = iframe.getAttribute("sandbox");
  if (attr === null) return false;
  const tokens = attr.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return !tokens.includes("allow-same-origin");
}

/**
 * `postMessage` targetOrigin for an embedded view iframe. A sandboxed opaque-origin
 * iframe can only be reached with the wildcard — its effective origin ("null") is
 * not a URL `postMessage` will match. Trust is preserved by the nonce-bound envelope
 * and the exact source-window binding in {@link attachViewHostBridge}.
 */
export function resolveViewIframeTargetOrigin(iframe: HTMLIFrameElement, hubBaseUrl: string): string {
  if (isSandboxedOpaqueOrigin(iframe)) return "*";
  return resolveViewIframeOrigin(iframe, hubBaseUrl);
}
