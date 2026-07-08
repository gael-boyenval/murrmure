import type {
  FlowIr,
  FlowManifest,
  FlowStep,
  FlowStepIr,
  SpaceApplyBundle,
  ViewManifest,
} from "@murrmure/contracts";
import { compileFlowIr } from "./compile.js";
import { lintStepContractManifest } from "./step-contract-compile.js";

/** Step kinds the flow engine advance runner dispatches (phase 03). */
export const ENGINE_DISPATCH_KINDS = ["invoke", "start_flow", "parallel", "gate", "checkpoint", "step_contract"] as const;

export type EngineDispatchKind = (typeof ENGINE_DISPATCH_KINDS)[number];

export interface FlowApplyLintWarning {
  flow_id: string;
  step_id?: string;
  code: string;
  message: string;
}

export interface FlowApplyLintIndex {
  actions: Record<string, { executor: string }>;
  executors: Record<string, unknown>;
  views: Array<{
    view_id: string;
    manifest: ViewManifest;
    build?: { dist_present: boolean; entry_present: boolean };
  }>;
}

export interface FlowApplyLintContext {
  flow_id: string;
  manifest: FlowManifest;
  /** Original manifest object (top-level keys preserved) for deprecation lint. */
  manifestRaw?: Record<string, unknown>;
}

/** Codes that stay warn-only even under `--strict`. */
export const WARN_ONLY_LINT_CODES = new Set([
  "DEPRECATED_START_KEY",
  "CHECKPOINT_LOOPBACK_HINT",
]);

function pushWarning(
  out: FlowApplyLintWarning[],
  ctx: FlowApplyLintContext,
  step_id: string | undefined,
  code: string,
  message: string,
): void {
  out.push({ flow_id: ctx.flow_id, step_id, code, message });
}

function stepIds(manifest: FlowManifest): Set<string> {
  return new Set(manifest.steps.map((s) => s.id));
}

function findView(
  viewId: string,
  views: FlowApplyLintIndex["views"],
): FlowApplyLintIndex["views"][number] | undefined {
  return views.find((v) => v.view_id === viewId || v.manifest.id === viewId);
}

/** Route must declare `goto` or `fail: true` — empty `{}` is not explicit (decision 06). */
function isExplicitOnResolveRoute(route: { goto?: string; fail?: boolean } | undefined): boolean {
  if (!route) return false;
  if (route.fail === true) return true;
  return typeof route.goto === "string" && route.goto.length > 0;
}

function viewBuildVerified(view: FlowApplyLintIndex["views"][number]): boolean {
  if (!view.build) return false;
  return view.build.dist_present && view.build.entry_present;
}

function walkIrSteps(steps: FlowStepIr[], visit: (step: FlowStepIr) => void): void {
  for (const step of steps) {
    visit(step);
    if (step.parallel?.lane) {
      walkIrSteps(step.parallel.lane, visit);
    }
  }
}

function lintUnsupportedStepKinds(
  ir: FlowIr,
  ctx: FlowApplyLintContext,
  out: FlowApplyLintWarning[],
): void {
  walkIrSteps(ir.steps, (step) => {
    if (ENGINE_DISPATCH_KINDS.includes(step.kind as EngineDispatchKind)) return;
    if (step.kind === "wait") {
      pushWarning(
        out,
        ctx,
        step.id,
        "UNSUPPORTED_STEP_KIND",
        `Step kind '${step.kind}' is not dispatched by the engine`,
      );
    }
  });
}

function lintInvokeCrossRefs(
  ir: FlowIr,
  index: FlowApplyLintIndex,
  ctx: FlowApplyLintContext,
  out: FlowApplyLintWarning[],
): void {
  walkIrSteps(ir.steps, (step) => {
    if (step.kind !== "invoke" || !step.invoke) return;
    const action = step.invoke.action;
    if (!index.actions[action]) {
      pushWarning(
        out,
        ctx,
        step.id,
        "ACTION_NOT_IN_INDEX",
        `invoke.action '${action}' is not declared in murrmure/actions.yaml`,
      );
      return;
    }
    const executor = index.actions[action]!.executor;
    if (!index.executors[executor]) {
      pushWarning(
        out,
        ctx,
        step.id,
        "EXECUTOR_BINDING_MISSING",
        `Action '${action}' references executor '${executor}' which is not declared in murrmure/executors.yaml`,
      );
    }
  });
}

function lintManifestStart(
  ctx: FlowApplyLintContext,
  out: FlowApplyLintWarning[],
): void {
  const raw = ctx.manifestRaw ?? (ctx.manifest as Record<string, unknown>);
  const hasStart = "start" in raw;
  const hasTriggers = "triggers" in raw;
  if (hasStart && !hasTriggers) {
    pushWarning(
      out,
      ctx,
      undefined,
      "DEPRECATED_START_KEY",
      "Top-level 'start:' is deprecated — migrate to 'triggers:' (see decision 05)",
    );
  }
  const start = ctx.manifest.start;
  if (start.requires_view) {
    pushWarning(
      out,
      ctx,
      undefined,
      "LEGACY_START_REQUIRES_VIEW",
      `start.requires_view '${start.requires_view}' is removed — use a step 0 checkpoint with view instead (decision 05)`,
    );
  }
  const triggers = ctx.manifest.triggers;
  if (triggers?.requires_view) {
    pushWarning(
      out,
      ctx,
      undefined,
      "LEGACY_START_REQUIRES_VIEW",
      `triggers.requires_view '${triggers.requires_view}' is removed — use a step 0 checkpoint with view instead (decision 05)`,
    );
  }
}

function lintCheckpointStep(
  step: FlowStep,
  stepIndex: number,
  manifest: FlowManifest,
  index: FlowApplyLintIndex,
  ctx: FlowApplyLintContext,
  out: FlowApplyLintWarning[],
): void {
  const checkpoint = step.checkpoint;
  if (!checkpoint) return;

  const viewId = checkpoint.view;
  const view = findView(viewId, index.views);
  if (!view) {
    pushWarning(
      out,
      ctx,
      step.id,
      "CHECKPOINT_VIEW_NOT_FOUND",
      `Checkpoint view '${viewId}' not found under murrmure/views/`,
    );
  } else if (!viewBuildVerified(view)) {
    pushWarning(
      out,
      ctx,
      step.id,
      "CHECKPOINT_VIEW_DIST_MISSING",
      `View '${viewId}' is missing built dist/ or manifest entry file — run npm run build in murrmure/views/${viewId}/ before apply`,
    );
  }

  const onResolve = checkpoint.on_resolve;
  if (!isExplicitOnResolveRoute(onResolve?.default)) {
    pushWarning(
      out,
      ctx,
      step.id,
      "CHECKPOINT_ON_RESOLVE_DEFAULT_MISSING",
      `Checkpoint '${step.id}' must declare on_resolve.default with goto or fail: true (decision 06)`,
    );
  }
  if (!isExplicitOnResolveRoute(onResolve?.cancel)) {
    pushWarning(
      out,
      ctx,
      step.id,
      "CHECKPOINT_ON_RESOLVE_CANCEL_MISSING",
      `Checkpoint '${step.id}' must declare on_resolve.cancel with goto or fail: true (decision 06)`,
    );
  }
  if (onResolve?.when && (!onResolve.values || Object.keys(onResolve.values).length === 0)) {
    pushWarning(
      out,
      ctx,
      step.id,
      "ON_RESOLVE_WHEN_VALUES_EMPTY",
      `Checkpoint '${step.id}' has on_resolve.when but empty values`,
    );
  }

  const ids = stepIds(manifest);
  const collectGoto = (route: { goto?: string } | undefined) => route?.goto;
  const gotos = [
    collectGoto(onResolve?.default),
    collectGoto(onResolve?.cancel),
    ...Object.values(onResolve?.values ?? {}).map(collectGoto),
  ].filter((g): g is string => Boolean(g));

  for (const goto of gotos) {
    if (!ids.has(goto)) {
      pushWarning(
        out,
        ctx,
        step.id,
        "GOTO_TARGET_NOT_FOUND",
        `on_resolve goto target '${goto}' is not a step id in this flow`,
      );
    }
  }

  const priorInvokeIds = manifest.steps
    .slice(0, stepIndex)
    .filter((s) => s.invoke)
    .map((s) => s.id);
  if (priorInvokeIds.length === 0) return;

  const loopbackTargets = new Set(
    [
      onResolve?.default?.goto,
      onResolve?.cancel?.goto,
      ...Object.values(onResolve?.values ?? {}).map((r) => r.goto),
    ].filter((g): g is string => Boolean(g)),
  );
  const hasLoopback = [...loopbackTargets].some((target) => priorInvokeIds.includes(target));
  if (!hasLoopback) {
    pushWarning(
      out,
      ctx,
      step.id,
      "CHECKPOINT_LOOPBACK_HINT",
      `Checkpoint '${step.id}' follows an invoke step but on_resolve has no loop-back goto to an earlier invoke — likely review loop missing`,
    );
  }
}

function lintManifestCheckpoints(
  manifest: FlowManifest,
  index: FlowApplyLintIndex,
  ctx: FlowApplyLintContext,
  out: FlowApplyLintWarning[],
): void {
  manifest.steps.forEach((step, i) => lintCheckpointStep(step, i, manifest, index, ctx, out));
}

export function lintFlowEngineCapabilities(
  ir: FlowIr,
  index: FlowApplyLintIndex,
  ctx: FlowApplyLintContext,
): FlowApplyLintWarning[] {
  const out: FlowApplyLintWarning[] = [];
  lintUnsupportedStepKinds(ir, ctx, out);
  lintInvokeCrossRefs(ir, index, ctx, out);
  lintManifestStart(ctx, out);
  lintManifestCheckpoints(ctx.manifest, index, ctx, out);
  const contractWarnings = lintStepContractManifest(ctx.manifest, ctx.flow_id);
  for (const w of contractWarnings) {
    out.push(w);
  }
  return out;
}

export function buildFlowApplyLintIndex(bundle: SpaceApplyBundle): FlowApplyLintIndex {
  return {
    actions: bundle.actions?.file.actions ?? {},
    executors: bundle.executors?.file.executors ?? {},
    views: (bundle.views ?? []).map((v) => ({
      view_id: v.view_id,
      manifest: v.manifest,
      build: v.build,
    })),
  };
}

export function lintSpaceApplyBundle(bundle: SpaceApplyBundle): FlowApplyLintWarning[] {
  const index = buildFlowApplyLintIndex(bundle);
  const warnings: FlowApplyLintWarning[] = [];
  for (const flow of bundle.flows ?? []) {
    const ir = compileFlowIr(flow.manifest, flow.flow_id);
    const raw =
      flow.raw && typeof flow.raw === "object" && !Array.isArray(flow.raw)
        ? (flow.raw as Record<string, unknown>)
        : undefined;
    warnings.push(
      ...lintFlowEngineCapabilities(ir, index, {
        flow_id: flow.flow_id,
        manifest: flow.manifest,
        manifestRaw: raw,
      }),
    );
  }
  return warnings;
}

export function strictLintFailures(warnings: FlowApplyLintWarning[]): FlowApplyLintWarning[] {
  return warnings.filter((w) => !WARN_ONLY_LINT_CODES.has(w.code));
}
