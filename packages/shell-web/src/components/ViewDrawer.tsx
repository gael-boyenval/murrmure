import type { ComponentType } from "react";
import { TriangleAlert } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@murrmure/shell-ui";
import { ViewHostFrame, defaultRunParamsForm, paramsSchemaToGateForm, resolveViewEntryUrl } from "@murrmure/view-sdk";
import type { GateForm } from "@murrmure/shell-client";
import { ViewParamForm } from "./ViewParamForm.js";
import { ReviewParamsView } from "./ReviewParamsView.js";
import { getStorageItem, getHubBaseUrl } from "../hooks.js";

export interface ViewDrawerFlow {
  flow_id: string;
  name: string;
  view_ref?: {
    view_id: string;
    origin_space_id?: string;
    entry_url?: string;
    shell_route?: string;
    params_schema?: string;
  };
  requires_view?: string | null;
}

export interface ViewDrawerProps {
  open: boolean;
  flow: ViewDrawerFlow | null;
  spaceId: string;
  onClose: () => void;
  onSubmit: (params: Record<string, unknown>) => void;
  submitting?: boolean;
  /** Optional parsed params schema JSON for form fallback. */
  paramsSchema?: unknown;
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

function resolveFallbackForm(flow: ViewDrawerFlow, paramsSchema?: unknown): GateForm {
  if (paramsSchema) return paramsSchemaToGateForm(paramsSchema);
  if (flow.view_ref?.params_schema) {
    return defaultRunParamsForm();
  }
  return defaultRunParamsForm();
}

const FALLBACK_WARNING =
  "Custom view unavailable — enter parameters to start the run.";

function ViewDrawerFallbackBanner() {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md border border-amber-800/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{FALLBACK_WARNING}</p>
    </div>
  );
}

/** @deprecated Pre-run ViewDrawer — checkpoint views use ViewCanvasHost (phase 05). Dev-only fallback. */
export function ViewDrawer({ open, flow, spaceId, onClose, onSubmit, submitting, paramsSchema }: ViewDrawerProps) {
  if (!flow) return null;

  const token = getStorageItem("murrmure_token") ?? "";
  const hubBase = getHubBaseUrl();
  const viewRef = flow.view_ref;
  const shellRoute = viewRef?.shell_route;
  const BuiltinView = shellRoute ? BUILTIN_ROUTES[shellRoute] : undefined;
  const iframeSrc =
    viewRef?.entry_url && viewRef.origin_space_id
      ? resolveViewEntryUrl(hubBase, {
          view_id: viewRef.view_id,
          origin_space_id: viewRef.origin_space_id,
          entry_url: viewRef.entry_url,
        })
      : undefined;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full max-w-md sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{flow.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">Collect run parameters</p>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-6 pt-2">
          {BuiltinView ? (
            <BuiltinView onSubmit={onSubmit} onCancel={onClose} submitting={submitting} />
          ) : iframeSrc ? (
            <div className="h-[min(60vh,480px)]">
              <ViewHostFrame
                src={iframeSrc}
                context={{
                  flow_id: flow.flow_id,
                  space_id: spaceId,
                  hub_base_url: hubBase,
                  token,
                }}
                onSubmit={onSubmit}
                onCancel={onClose}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <ViewDrawerFallbackBanner />
              <ViewParamForm
                form={resolveFallbackForm(flow, paramsSchema)}
                onSubmit={onSubmit}
                onCancel={onClose}
                submitting={submitting}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
