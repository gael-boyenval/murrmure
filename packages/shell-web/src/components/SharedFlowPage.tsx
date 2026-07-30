import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RunGraphPayload } from "@murrmure/shell-client";
import { Badge, cn } from "@murrmure/shell-ui";
import { Link } from "react-router-dom";
import { AppShell } from "../layout/AppShell.js";
import { useIsMobile } from "../hooks/useMediaQuery.js";
import { FlowStepMetadataPanel } from "./FlowStepMetadataPanel.js";
import { ResizableSplitPane } from "./ResizableSplitPane.js";

const RunFlowchartView = lazy(() =>
  import("./RunFlowchartView.js").then((module) => ({ default: module.RunFlowchartView })),
);

type SideTab = "inspector" | "contract";

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

function SideTabBar({
  tab,
  onTabChange,
  showInspector,
}: {
  tab: SideTab;
  onTabChange: (tab: SideTab) => void;
  showInspector: boolean;
}) {
  if (!showInspector) return null;
  return (
    <div className="flex shrink-0 gap-1 border-b border-border pb-2" role="tablist" aria-label="Step detail">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "inspector"}
        className={cn(
          "rounded px-2.5 py-1 text-xs font-medium",
          tab === "inspector"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onTabChange("inspector")}
      >
        Inspector
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "contract"}
        className={cn(
          "rounded px-2.5 py-1 text-xs font-medium",
          tab === "contract"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onTabChange("contract")}
      >
        Contract
      </button>
    </div>
  );
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
  const [sideTab, setSideTab] = useState<SideTab>("inspector");
  const renderableGraph =
    graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
      ? graph
      : undefined;
  const selectedNode = renderableGraph?.nodes.find(
    (node) => node.kind === "step_contract" && node.step_id === selectedStepId,
  );
  const showInspectorTab = Boolean(secondary);
  const activeTab: SideTab = showInspectorTab ? sideTab : "contract";
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

  const detailBody = (
    <>
      <SideTabBar tab={activeTab} onTabChange={setSideTab} showInspector={showInspectorTab} />
      {activeTab === "contract" ? (
        <FlowStepMetadataPanel node={selectedNode} onClose={closeMetadata} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">{secondary}</div>
      )}
    </>
  );

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
              className="scrollbar-subtle relative z-10 flex max-h-[85vh] w-full flex-col gap-3 overflow-y-auto rounded-t-xl border border-border bg-card p-3 shadow-xl outline-none"
            >
              <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
              {detailBody}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <AppShell fillMain>
      {topBanner}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
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
          className="min-h-0 flex-1"
          primary={
            renderableGraph ? (
              <Suspense fallback={<p className="text-sm text-muted-foreground">Loading flowchart…</p>}>
                <RunFlowchartView
                  graph={renderableGraph}
                  execContext={execContext}
                  runLifecycle={status}
                  selectedRunId={selectedRunId}
                  selectedStepId={selectedStepId}
                  onSelectLane={onSelectLane}
                  onSelectStep={(stepId) => onSelectStep(stepId)}
                />
              </Suspense>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">{graphFallback}</div>
            )
          }
          secondary={
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">{detailBody}</div>
          }
        />

        {mobileDrawer}
      </div>
    </AppShell>
  );
}
