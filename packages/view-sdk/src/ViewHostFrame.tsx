import { useEffect, useRef } from "react";
import type { ViewAppContext } from "./types.js";
import { attachViewHostBridge } from "./host-bridge.js";

export interface ViewHostFrameProps {
  src: string;
  context: ViewAppContext;
  onSubmitBranch: (branch: string, params: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: import("./types.js").ViewContractError }>;
  onCancel: () => Promise<{ ok: true } | { ok: false; error: import("./types.js").ViewContractError }>;
  onResolved?: () => void;
  className?: string;
  title?: string;
}

/**
 * Restrictive CSP for the embedded View. Blocks network fetch/XHR/connect,
 * form submission, popups, plugins, and external resources; allows only
 * same-origin scripts/styles and inline styles for the Vite bundle.
 */
const VIEW_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "navigate-to 'none'",
].join("; ");

/** Embeds a custom view iframe and wires the versioned, nonce-bound murrmure
 * view host postMessage protocol. Sandbox is `allow-scripts` only — no
 * same-origin, forms, popups, downloads, or top navigation — so the View
 * cannot access Hub credentials, storage, or mutate orchestration directly. */
export function ViewHostFrame({
  src,
  context,
  onSubmitBranch,
  onCancel,
  onResolved,
  className,
  title,
}: ViewHostFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onReady = () => {
      /* host may record readiness; no fallback control is synthesized */
    };
    return attachViewHostBridge(iframe, context, {
      onReady,
      onSubmitBranch: onSubmitBranch,
      onCancel: onCancel,
      onResolved,
    });
  }, [src, context, onSubmitBranch, onCancel, onResolved]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title ?? "Custom view"}
      className={className ?? "h-full w-full border-0 bg-background"}
      sandbox="allow-scripts"
      // `csp` restricts the embedded document (HTML spec); React does not type
      // it, so spread it as a raw attribute.
      {...({ csp: VIEW_CSP } as Record<string, string>)}
    />
  );
}
