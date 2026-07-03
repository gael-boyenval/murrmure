/**
 * Resolve postMessage target/check origin for a view iframe.
 *
 * Production iframes load hub-served `dist/` assets (hub origin). Dev iframes load
 * the author's Vite server (e.g. localhost:5173) while `hub_base_url` stays the hub
 * token origin — see studio-specs/plans/product/plan/decisions/02-view-dev-loop.md.
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
