import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { ViewAppContext, ViewContractError } from "@murrmure/view-sdk";
import { ViewHostFrame, resolveViewEntryUrl } from "@murrmure/view-sdk";
import { Badge, Button, cn } from "@murrmure/shell-ui";
import type { ViewRefLike } from "../lib/view-app-context.js";
import { DataTableView } from "./DataTableView.js";

export interface ViewCanvasFixtureTab {
  name: string;
  context: ViewAppContext;
}

type Ack = { ok: true } | { ok: false; error: ViewContractError };

export interface ViewCanvasHostProps {
  /** Session or workflow title — primary human label (decision 07). */
  title: string;
  viewRef?: ViewRefLike;
  iframeSrc?: string;
  context: ViewAppContext;
  /** Host-mediated v3 submit. Resolves the branch + params through the hub. */
  onSubmitBranch: (branch: string, params: Record<string, unknown>) => Promise<Ack>;
  /** Host-mediated v3 cancel. */
  onCancel?: () => Promise<Ack>;
  onResolved?: () => void;
  submitting?: boolean;
  /** Dev-only fixture tabs (decision 02). */
  devMode?: boolean;
  fixtureTabs?: ViewCanvasFixtureTab[];
  activeFixture?: string;
  onFixtureChange?: (name: string) => void;
  /** Link back to operator session view when in production checkpoint mode. */
  adminHref?: string;
  adminLabel?: string;
  /** Link to space home for navigation out of full-screen checkpoint. */
  homeHref?: string;
  homeLabel?: string;
}

/**
 * Hardened host for a locally built custom View. No built-in fallback form is
 * rendered: when no View is projected the shell stays observability-only and
 * this host is not mounted. Dev mode logs non-mutating intents and acks ok.
 */
export function ViewCanvasHost({
  title,
  viewRef,
  iframeSrc: iframeSrcProp,
  context,
  onSubmitBranch,
  onCancel,
  onResolved,
  devMode,
  fixtureTabs,
  activeFixture,
  onFixtureChange,
  adminHref,
  adminLabel = "Operator view",
  homeHref,
  homeLabel = "Space home",
}: ViewCanvasHostProps) {
  const iframeSrc =
    iframeSrcProp ??
    (viewRef?.entry_url && viewRef.origin_space_id
      ? resolveViewEntryUrl(context.hub_base_url, {
          view_id: viewRef.view_id,
          origin_space_id: viewRef.origin_space_id,
          entry_url: viewRef.entry_url,
        })
      : undefined);

  const [devLog, setDevLog] = useState<string | null>(null);
  const [devPayload, setDevPayload] = useState<{ branch: string; params: Record<string, unknown> } | null>(null);

  const handleSubmitBranch = useCallback(
    async (branch: string, params: Record<string, unknown>): Promise<Ack> => {
      if (devMode) {
        setDevLog("[dev] submit_branch");
        setDevPayload({ branch, params });
        console.info("[dev] submit_branch", branch, params);
        return { ok: true };
      }
      return onSubmitBranch(branch, params);
    },
    [devMode, onSubmitBranch],
  );

  const handleCancel = useCallback(async (): Promise<Ack> => {
    if (devMode) {
      setDevLog("[dev] cancel");
      setDevPayload(null);
      console.info("[dev] cancel");
      return { ok: true };
    }
    return onCancel ? onCancel() : { ok: true };
  }, [devMode, onCancel]);

  useEffect(() => {
    if (!devMode) {
      setDevLog(null);
      setDevPayload(null);
    }
  }, [activeFixture, devMode]);

  return (
    <div
      data-testid="view-canvas-host"
      className="flex min-h-[calc(100vh-3rem)] w-full flex-col"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          {context.step?.step_id ? (
            <p className="truncate text-sm text-muted-foreground">{context.step.step_id}</p>
          ) : context.gate?.step_id ? (
            <p className="truncate text-sm text-muted-foreground">{context.gate.step_id}</p>
          ) : null}
        </div>
        {devMode ? (
          <Badge variant="outline">Dev</Badge>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {homeHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={homeHref}>{homeLabel}</Link>
              </Button>
            ) : null}
            {adminHref ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={adminHref}>{adminLabel}</Link>
              </Button>
            ) : null}
          </div>
        )}
      </header>

      {devMode && fixtureTabs && fixtureTabs.length > 0 ? (
        <div
          data-testid="view-canvas-fixture-tabs"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-4 py-2"
        >
          {fixtureTabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              className={cn(
                "shrink-0 rounded-md px-3 py-1 text-sm transition-colors",
                tab.name === activeFixture
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => onFixtureChange?.(tab.name)}
            >
              {tab.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 w-full">
        {iframeSrc ? (
          <ViewHostFrame
            src={iframeSrc}
            context={context}
            onSubmitBranch={handleSubmitBranch}
            onCancel={handleCancel}
            onResolved={onResolved}
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        ) : (
          // Observability-only empty state. No fallback form is synthesized;
          // unbound steps never reach this host (shouldShowStepCanvas gates it).
          <div
            data-testid="view-canvas-observability"
            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"
          >
            <TriangleAlert className="size-5 text-muted-foreground" aria-hidden />
            <p>No custom view is bound to this step. The shell is observability-only.</p>
          </div>
        )}
      </div>

      {devMode && devLog ? (
        <div
          data-testid="view-canvas-dev-log"
          className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground"
        >
          <p className="mb-1 font-mono">{devLog}</p>
          {devPayload ? (
            <DataTableView value={{ branch: devPayload.branch, params: devPayload.params }} />
          ) : (
            <span className="font-mono">{devLog}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Kept for backwards compatibility with any external importer; the checkpoint
// canvas no longer renders built-in forms (Task 04).
export const ViewCanvasFallbackBanner: ComponentType = function ViewCanvasFallbackBanner() {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg gap-2 rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>Custom view unavailable — using built-in fallback form (admin path only).</p>
    </div>
  );
};
