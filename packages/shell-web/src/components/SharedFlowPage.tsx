import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import type { RunGraphPayload } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";
import { Link } from "react-router-dom";
import { AppShell } from "../layout/AppShell.js";
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
  const renderableGraph =
    graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
      ? graph
      : undefined;
  const selectedNode = renderableGraph?.nodes.find(
    (node) => node.kind === "step_contract" && node.step_id === selectedStepId,
  );

  useEffect(() => {
    if (
      !selectedNode ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(min-width: 768px)").matches)
    ) return;
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
  }, [selectedNode, onSelectStep]);

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
              <FlowStepMetadataPanel node={selectedNode} />
              {secondary}
            </>
          }
        />

        {selectedNode ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:hidden">
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={`Step metadata for ${selectedNode.step_id}`}
              tabIndex={-1}
              className="max-h-[85vh] w-full overflow-y-auto rounded-t-xl bg-background p-3 outline-none"
            >
              <FlowStepMetadataPanel node={selectedNode} onClose={() => onSelectStep(undefined)} />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
