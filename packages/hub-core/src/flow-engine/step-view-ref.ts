import type { FlowViewRef, RunStepMemo, StepContractCatalog } from "@murrmure/contracts";
import type { SpaceApplyBundle } from "@murrmure/contracts";
import { catalogEntryForStep } from "./step-catalog.js";

function resolveViewRefFromBundle(
  viewId: string,
  views: SpaceApplyBundle["views"],
  originSpaceId: string,
): FlowViewRef | undefined {
  const view = (views ?? []).find((v) => v.view_id === viewId || v.manifest.id === viewId);
  if (!view) return undefined;
  return {
    view_id: view.view_id,
    origin_space_id: originSpaceId,
    entry_url: view.manifest.entry,
    shell_route: view.manifest.shell_route,
    params_schema: view.manifest.params_schema,
  };
}

/** Denormalize view_ref onto catalog presentation entries at apply time. */
export function enrichCatalogViewRefs(
  catalog: StepContractCatalog,
  views: SpaceApplyBundle["views"],
  originSpaceId: string,
): void {
  for (const entry of catalog.entries) {
    const viewId = entry.presentation?.view;
    if (!viewId || entry.presentation?.view_ref) continue;
    const view_ref = resolveViewRefFromBundle(viewId, views, originSpaceId);
    if (view_ref && entry.presentation) {
      entry.presentation.view_ref = view_ref;
    }
  }
}

export interface ActiveHumanStep {
  step_id: string;
  view_ref?: FlowViewRef;
  assignees?: string[];
  branch_names: string[];
}

function prefixedSpaceId(space_id: string): string {
  return space_id.startsWith("spc_") ? space_id : `spc_${space_id}`;
}

/** Resolve view_ref from catalog presentation, with apply-time ref or runtime fallback. */
export function presentationViewRef(
  presentation: { view?: string; view_ref?: FlowViewRef } | undefined,
  originSpaceId: string,
): FlowViewRef | undefined {
  if (!presentation?.view) return undefined;
  if (presentation.view_ref) return presentation.view_ref;
  return {
    view_id: presentation.view,
    origin_space_id: prefixedSpaceId(originSpaceId),
    entry_url: "./dist/index.html",
  };
}

/** Find the active human step from run memos + compiled catalog. */
export function findActiveHumanStep(
  memos: RunStepMemo[],
  catalog: StepContractCatalog | null | undefined,
  originSpaceId?: string,
): ActiveHumanStep | null {
  const memo = memos.find((m) => m.status === "awaiting_human");
  if (!memo || !catalog) return null;
  const entry = catalogEntryForStep(catalog, memo.step_id);
  if (!entry?.presentation?.view) return null;
  const spaceId = originSpaceId ?? catalog.flow_id.replace(/^flw_/, "");
  return {
    step_id: memo.step_id,
    view_ref: presentationViewRef(entry.presentation, spaceId),
    assignees: entry.presentation.assignees,
    branch_names: Object.keys(entry.branches),
  };
}
