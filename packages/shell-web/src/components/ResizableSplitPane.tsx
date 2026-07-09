import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@murrmure/shell-ui";

const STORAGE_KEY = "murrmure.flow-page.secondary-width";
const DEFAULT_SECONDARY_WIDTH = 384;
const MIN_PRIMARY_WIDTH = 320;
const MIN_SECONDARY_WIDTH = 280;
const MAX_SECONDARY_WIDTH = 720;
const HANDLE_WIDTH = 6;

function readStoredWidth(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampSecondaryWidth(width: number, containerWidth: number): number {
  const maxByPrimary = containerWidth - MIN_PRIMARY_WIDTH - HANDLE_WIDTH;
  const max = Math.min(MAX_SECONDARY_WIDTH, maxByPrimary);
  return Math.max(MIN_SECONDARY_WIDTH, Math.min(max, width));
}

export interface ResizableSplitPaneProps {
  primary: ReactNode;
  secondary: ReactNode;
  className?: string;
  defaultSecondaryWidth?: number;
}

export function ResizableSplitPane({
  primary,
  secondary,
  className,
  defaultSecondaryWidth = DEFAULT_SECONDARY_WIDTH,
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(defaultSecondaryWidth);
  const [secondaryWidth, setSecondaryWidth] = useState(
    () => readStoredWidth() ?? defaultSecondaryWidth,
  );
  const [dragging, setDragging] = useState(false);

  widthRef.current = secondaryWidth;

  const applyWidth = useCallback((next: number) => {
    const containerWidth = containerRef.current?.offsetWidth ?? 0;
    if (containerWidth <= 0) {
      setSecondaryWidth(next);
      return;
    }
    setSecondaryWidth(clampSecondaryWidth(next, containerWidth));
  }, []);

  useEffect(() => {
    const onResize = () => {
      setSecondaryWidth((current) => {
        const containerWidth = containerRef.current?.offsetWidth ?? 0;
        if (containerWidth <= 0) return current;
        return clampSecondaryWidth(current, containerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(widthRef.current));
    }
  }, []);

  return (
    <div ref={containerRef} className={cn("flex min-h-0 flex-1", className)}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{primary}</div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        className={cn(
          "relative z-10 shrink-0 touch-none select-none",
          dragging ? "cursor-col-resize" : "cursor-col-resize",
        )}
        style={{ width: HANDLE_WIDTH }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { startX: event.clientX, startWidth: secondaryWidth };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          const delta = dragRef.current.startX - event.clientX;
          applyWidth(dragRef.current.startWidth + delta);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          endDrag();
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          endDrag();
        }}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
            dragging ? "bg-primary/70" : "hover:bg-primary/40",
          )}
        />
        <div
          className={cn(
            "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-full border border-border bg-zinc-900/90 px-0.5 py-1.5 opacity-70 transition-opacity",
            dragging ? "opacity-100" : "hover:opacity-100",
          )}
        >
          <span className="block size-0.5 rounded-full bg-zinc-500" />
          <span className="block size-0.5 rounded-full bg-zinc-500" />
          <span className="block size-0.5 rounded-full bg-zinc-500" />
        </div>
      </div>

      <div
        className="flex min-h-0 shrink-0 flex-col gap-3 overflow-hidden"
        style={{ width: secondaryWidth }}
      >
        {secondary}
      </div>
    </div>
  );
}

export {
  clampSecondaryWidth,
  DEFAULT_SECONDARY_WIDTH,
  MAX_SECONDARY_WIDTH,
  MIN_PRIMARY_WIDTH,
  MIN_SECONDARY_WIDTH,
};
