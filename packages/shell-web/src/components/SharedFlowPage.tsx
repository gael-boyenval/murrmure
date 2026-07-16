import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RunGraphPayload } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";
import { Link } from "react-router-dom";
import { AppShell } from "../layout/AppShell.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { FlowStepMetadataPanel } from "./FlowStepMetadataPanel.js";
import { ResizableSplitPane } from "./ResizableSplitPane.js";

const RunFlowchartView = lazy(() =>
  import("./RunFlowchartView.js").then((module) => ({ default: module.RunFlowchartView })),
);

export interface SharedFlowPageProps {
  title: string;
  subtitle?: string;
  status?: string;
  backHref?: string;
  backLabel?: string;
  topBanner?: ReactNode;
  actions?: ReactNode;
  graph?: RunGraphPayload;
  graphFallback?: ReactNode;
  execContext?: Record<string, unknown>;
  selectedRunId?: string;
  selectedStepId?: string;
  onSelectLane?: (runId: string) => void;
  onSelectStep: (stepId: string | undefined) => void;
  secondary?: ReactNode;
}

export function SharedFlowPage({
  title,
  subtitle,
  status,
  backHref,
  backLabel,
  topBanner,
  actions,
  graph,
  graphFallback,
  execContext,
  selectedRunId,
  selectedStepId,
  onSelectLane,
  onSelectStep,
  secondary,
}: SharedFlowPageProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const renderableGraph =
    graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
      ? graph
      : undefined;
  const selectedNode = renderableGraph?.nodes.find(
    (node) => node.kind === "step_contract" && node.step_id === selectedStepId,
  );
  const showMobileDrawer = Boolean(selectedNode && isMobile);

  useEffect(() => {
    if (!showMobileDrawer) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelectStep(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [showMobileDrawer, onSelectStep]);

  const closeMetadata = selectedNode ? () => onSelectStep(undefined) : undefined;

  const mobileDrawer =
    showMobileDrawer && selectedNode && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center md:hidden"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Dismiss step metadata"
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              onClick={() => onSelectStep(undefined)}
            />
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={`Step metadata for ${selectedNode.step_id}`}
              tabIndex={-1}
              className="scrollbar-subtle relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card p-3 shadow-xl outline-none"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
              <FlowStepMetadataPanel node={selectedNode} onClose={closeMetadata} />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <AppShell>
      {topBanner}
      <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <header className="shrink-0">
          {backHref ? (
            <Link to={backHref} className="mb-2 inline-block text-sm text-muted-foreground hover:underline">
              ← {backLabel ?? "Back"}
            </Link>
          ) : null}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {subtitle ? <p className="font-mono text-sm text-muted-foreground">{subtitle}</p> : null}
                {status ? <Badge variant="outline">{status}</Badge> : null}
              </div>
            </div>
            {actions}
          </div>
        </header>

        <ResizableSplitPane
          primary={
            renderableGraph ? (
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading flowchart…</p>}>
                <RunFlowchartView
                  graph={renderableGraph}
                  execContext={execContext}
                  selectedRunId={selectedRunId}
                  selectedStepId={selectedStepId}
                  onSelectLane={onSelectLane}
                  onSelectStep={(stepId) => onSelectStep(stepId)}
                />
              </Suspense>
            ) : (
              graphFallback
            )
          }
          secondary={
            <>
              <FlowStepMetadataPanel node={selectedNode} onClose={closeMetadata} />
              {secondary}
            </>
          }
        />

        {mobileDrawer}
      </div>
    </AppShell>
  );
}
