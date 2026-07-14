import type {
  FlowIr,
  FlowManifest,
  FlowStep,
  FlowStepIr,
  SpaceApplyBundle,
  ViewManifest,
} from "@murrmure/contracts";
import { compileFlowIr } from "./compile.js";
import { compileStepContractCatalog, lintActionMurrmureTokens, lintStepContractManifest } from "./step-contract-compile.js";
import { lintHandlerCatalogCoverage } from "../index/handler-catalog-lint.js";

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
    pushWarning(
      out,
      ctx,
      step.id,
      "UNSUPPORTED_STEP_KIND",
      `Step kind '${step.kind}' is not dispatched by the engine`,
    );
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
  _ctx: FlowApplyLintContext,
  _out: FlowApplyLintWarning[],
): void {
  // `start` and `requires_view` are rejected by the parser; no warn-only path.
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
  const knownStepIds = new Set<string>();
  for (const flow of bundle.flows ?? []) {
    const { catalog } = compileStepContractCatalog(flow.manifest, flow.flow_id);
    if (catalog) {
      for (const stepId of catalog.step_ids) knownStepIds.add(stepId);
    }
  }
  for (const w of lintActionMurrmureTokens(bundle.actions?.file.actions ?? {}, knownStepIds)) {
    warnings.push(w);
  }
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
  const handlers = bundle.handlers?.file;
  if (handlers) {
    const handlerWarnings = lintHandlerCatalogCoverage({
      handlers,
      flows: (bundle.flows ?? []).map((flow) => ({
        flow_id: flow.flow_id,
        manifest: flow.manifest,
      })),
    });
    for (const warning of handlerWarnings) {
      warnings.push({
        flow_id: warning.flow_id ?? "handlers",
        step_id: warning.step_id,
        code: warning.code,
        message: warning.message,
      });
    }
  }
  return warnings;
}

export function strictLintFailures(warnings: FlowApplyLintWarning[]): FlowApplyLintWarning[] {
  return warnings.filter((w) => !WARN_ONLY_LINT_CODES.has(w.code));
}
