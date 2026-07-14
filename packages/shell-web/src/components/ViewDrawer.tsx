import { useState, type ComponentType } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@murrmure/shell-ui";
import {
  ViewHostFrame,
  VIEW_TRANSPORT_VERSION,
  defaultRunParamsForm,
  paramsSchemaToGateForm,
  resolveViewEntryUrl,
  type ViewAppContext,
  type ViewContractError,
} from "@murrmure/view-sdk";
import type { GateForm } from "@murrmure/shell-client";
import { ViewParamForm } from "./ViewParamForm.js";
import { ReviewParamsView } from "./ReviewParamsView.js";
import { getHubBaseUrl } from "../hooks.js";

type Ack = { ok: true } | { ok: false; error: ViewContractError };

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

export function ViewDrawer({ open, flow, spaceId, onClose, onSubmit, submitting, paramsSchema }: ViewDrawerProps) {
  const [nonce] = useState(() => globalThis.crypto?.randomUUID?.() ?? `nonce-${Date.now()}`);
  if (!flow) return null;

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

  const showFallback = !BuiltinView && !iframeSrc;

  const iframeContext: ViewAppContext = {
    flow_id: flow.flow_id,
    space_id: spaceId,
    hub_base_url: hubBase,
    mode: "production",
    transport_version: VIEW_TRANSPORT_VERSION,
    nonce,
    step: { step_id: "start", branches: [{ branch: "start" }] },
  };

  const onSubmitBranch = async (_branch: string, params: Record<string, unknown>): Promise<Ack> => {
    onSubmit(params);
    return { ok: true };
  };
  const onCancel = async (): Promise<Ack> => {
    onClose();
    return { ok: true };
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full max-w-md sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{flow.name}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {showFallback
              ? "Custom view unavailable — enter parameters to start the run."
              : "Collect run parameters"}
          </p>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-6 pt-2">
          {BuiltinView ? (
            <BuiltinView onSubmit={onSubmit} onCancel={onClose} submitting={submitting} />
          ) : iframeSrc ? (
            <div className="h-[min(60vh,480px)]">
              <ViewHostFrame
                src={iframeSrc}
                context={iframeContext}
                onSubmitBranch={onSubmitBranch}
                onCancel={onCancel}
              />
            </div>
          ) : (
            <ViewParamForm
              form={resolveFallbackForm(flow, paramsSchema)}
              onSubmit={onSubmit}
              onCancel={onClose}
              submitting={submitting}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
