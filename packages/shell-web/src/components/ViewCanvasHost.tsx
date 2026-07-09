import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { ViewAppContext } from "@murrmure/view-sdk";
import { ViewHostFrame, resolveViewEntryUrl } from "@murrmure/view-sdk";
import { Badge, Button, cn } from "@murrmure/shell-ui";
import type { ViewRefLike } from "../lib/view-app-context.js";
import { DataTableView } from "./DataTableView.js";
import { ReviewParamsView } from "./ReviewParamsView.js";
import { ViewParamForm } from "./ViewParamForm.js";
import { defaultRunParamsForm } from "@murrmure/view-sdk";

export interface ViewCanvasFixtureTab {
  name: string;
  context: ViewAppContext;
}

export interface ViewCanvasHostProps {
  /** Session or workflow title — primary human label (decision 07). */
  title: string;
  viewRef?: ViewRefLike;
  iframeSrc?: string;
  context: ViewAppContext;
  onSubmit: (params: Record<string, unknown>) => void;
  onCancel?: () => void;
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

const BUILTIN_ROUTES: Record<
  string,
  ComponentType<{
    onSubmit: (p: Record<string, unknown>) => void;
    onCancel?: () => void;
    submitting?: boolean;
  }>
> = {
  "murrmure/review-params": ReviewParamsView,
};

function ViewCanvasFallbackBanner() {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg gap-2 rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>Custom view unavailable — using built-in fallback form (admin path only).</p>
    </div>
  );
}

export function ViewCanvasHost({
  title,
  viewRef,
  iframeSrc: iframeSrcProp,
  context,
  onSubmit,
  onCancel,
  onResolved,
  submitting,
  devMode,
  fixtureTabs,
  activeFixture,
  onFixtureChange,
  adminHref,
  adminLabel = "Operator view",
  homeHref,
  homeLabel = "Space home",
}: ViewCanvasHostProps) {
  const shellRoute = viewRef?.shell_route;
  const BuiltinView = shellRoute ? BUILTIN_ROUTES[shellRoute] : undefined;
  const iframeSrc =
    iframeSrcProp ??
    (viewRef?.entry_url && viewRef.origin_space_id
      ? resolveViewEntryUrl(context.hub_base_url, {
          view_id: viewRef.view_id,
          origin_space_id: viewRef.origin_space_id,
          entry_url: viewRef.entry_url,
        })
      : undefined);

  const [devSubmitLog, setDevSubmitLog] = useState<string | null>(null);
  const [devSubmitParams, setDevSubmitParams] = useState<Record<string, unknown> | null>(null);

  const handleSubmit = useCallback(
    (params: Record<string, unknown>) => {
      if (devMode) {
        setDevSubmitLog("[dev] submit");
        setDevSubmitParams(params);
        console.info("[dev] submit", params);
        return;
      }
      onSubmit(params);
    },
    [devMode, onSubmit],
  );

  const handleCancel = useCallback(() => {
    if (devMode) {
      setDevSubmitLog("[dev] cancel");
      setDevSubmitParams(null);
      console.info("[dev] cancel");
      return;
    }
    onCancel?.();
  }, [devMode, onCancel]);

  useEffect(() => {
    if (!devMode) {
      setDevSubmitLog(null);
      setDevSubmitParams(null);
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
        {BuiltinView ? (
          <div className="mx-auto max-w-lg p-6">
            <BuiltinView onSubmit={handleSubmit} onCancel={handleCancel} submitting={submitting} />
          </div>
        ) : iframeSrc ? (
          <ViewHostFrame
            src={iframeSrc}
            context={context}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onResolved={onResolved}
            className="absolute inset-0 h-full w-full border-0 bg-background"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
            <ViewCanvasFallbackBanner />
            <div className="w-full max-w-lg">
              <ViewParamForm
                form={defaultRunParamsForm()}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                submitting={submitting}
              />
            </div>
          </div>
        )}
      </div>

      {devMode && devSubmitLog ? (
        <div
          data-testid="view-canvas-dev-log"
          className="shrink-0 border-t border-border px-4 py-2 text-xs text-muted-foreground"
        >
          <p className="mb-1 font-mono">{devSubmitLog.startsWith("[dev] submit") ? "[dev] submit" : devSubmitLog}</p>
          {devSubmitParams ? (
            <DataTableView value={devSubmitParams} />
          ) : (
            <span className="font-mono">{devSubmitLog}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
