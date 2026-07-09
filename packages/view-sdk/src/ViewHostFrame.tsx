import { useEffect, useRef } from "react";
import type { ViewAppContext } from "./types.js";
import { attachViewHostBridge } from "./host-bridge.js";

export interface ViewHostFrameProps {
  src: string;
  context: ViewAppContext;
  onSubmit: (params: Record<string, unknown>) => void;
  onCancel?: () => void;
  onResolved?: () => void;
  className?: string;
  title?: string;
}

/** Embeds a custom view iframe and wires the murrmure view host postMessage protocol. */
export function ViewHostFrame({
  src,
  context,
  onSubmit,
  onCancel,
  onResolved,
  className,
  title,
}: ViewHostFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    return attachViewHostBridge(iframe, context, { onSubmit, onCancel, onResolved });
  }, [src, context, onSubmit, onCancel, onResolved]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title ?? "Custom view"}
      className={className ?? "h-full w-full border-0 bg-background"}
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
