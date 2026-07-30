import { useEffect, useRef } from "react";
import type { ViewAppContext, ViewBranchSubmitInput, ViewSubmissionState } from "./types.js";
import { attachViewHostBridge } from "./host-bridge.js";

export interface ViewHostFrameProps {
  src: string;
  context: ViewAppContext;
  onSubmitBranch: (
    branch: string,
    input: ViewBranchSubmitInput,
    submission: { submission_id: string; report: (state: ViewSubmissionState) => void },
  ) => Promise<{ ok: true } | { ok: false; error: import("./types.js").ViewContractError }>;
  onCancelSubmission?: (submission_id: string) => Promise<void> | void;
  onOpenChild?: (
    child_step_id: string,
    idempotency_key: string,
  ) => Promise<{ ok: true } | { ok: false; error: import("./types.js").ViewContractError }>;
  onCancel: () => Promise<{ ok: true } | { ok: false; error: import("./types.js").ViewContractError }>;
  onResolved?: () => void;
  className?: string;
  title?: string;
}

/**
 * CSP for hub-served View HTML responses (Content-Security-Policy header).
 * Do NOT put this on the iframe `csp` attribute — that is CSP Embedded
 * Enforcement and refuses the frame unless the response sends Allow-CSP-From
 * (blank canvas). Isolation comes from sandbox + this response header.
 *
 * Under `sandbox="allow-scripts"` (opaque origin), `'self'` matches nothing,
 * so script/style must allow http(s) for hub-served relative assets.
 */
export const VIEW_DOCUMENT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' http: https:",
  "style-src 'unsafe-inline' http: https:",
  "img-src http: https: data:",
  "font-src http: https: data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Embeds a custom view iframe and wires the versioned, nonce-bound murrmure
 * view host postMessage protocol. Production sandbox is `allow-scripts` only —
 * no same-origin, forms, popups, downloads, or top navigation — so the View
 * cannot access Hub credentials, storage, or mutate orchestration directly.
 * Dev mode relaxes sandbox so a local Vite server can load modules and
 * accept file inputs. */
export function ViewHostFrame({
  src,
  context,
  onSubmitBranch,
  onCancel,
  onCancelSubmission,
  onOpenChild,
  onResolved,
  className,
  title,
}: ViewHostFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isDev = context.mode === "dev";

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onReady = () => {
      /* host may record readiness; no fallback control is synthesized */
    };
    return attachViewHostBridge(iframe, context, {
      onReady,
      onSubmitBranch: onSubmitBranch,
      onCancelSubmission,
      onOpenChild,
      onCancel: onCancel,
      onResolved,
    });
  }, [src, context, onSubmitBranch, onCancelSubmission, onOpenChild, onCancel, onResolved]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title ?? "Custom view"}
      className={className ?? "h-full w-full border-0 bg-background"}
      sandbox={
        isDev ? "allow-scripts allow-same-origin allow-forms" : "allow-scripts"
      }
    />
  );
}
