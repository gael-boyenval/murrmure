import type {
  HandlerSpec,
  OpenStepResolverProjection,
  RunStepMemo,
  StepContractCatalog,
  ViewManifest,
} from "@murrmure/contracts";
import { parseHandlerStepBinding } from "@murrmure/contracts";
import { catalogEntryForStep } from "./step-catalog.js";
import { buildHandlerIndex, matchStepOpenedHandlers } from "../index/parse-handlers.js";
import { computeContentDigest } from "../index/digest.js";
import type { RunGraphResolver } from "./graph.js";

/** Persisted view row projected from the space index. */
export interface ProjectedViewRow {
  view_id: string;
  manifest: ViewManifest;
}

export interface OpenStepProjectionContext {
  /** Readable flow name — the `{flow_name}` prefix of `on::key` aliases. */
  flow_name?: string;
  /** Origin space of the run; becomes the view `origin_space_id`. */
  space_id?: string;
  /** Applied space handlers (parsed). */
  handlers?: HandlerSpec[];
  /** Applied space views (parsed). */
  views?: ProjectedViewRow[];
  exec_context?: Record<string, unknown>;
}

/**
 * Build the only resolver identity safe to pin on a run or expose in a graph.
 * The digest covers the complete applied handler configuration while the
 * projection deliberately excludes command, prompt, cwd, params and secrets.
 */
export function buildSafeResolverMap(
  catalog: StepContractCatalog | null | undefined,
  flowName: string | undefined,
  handlers: HandlerSpec[],
): Record<string, RunGraphResolver | null> {
  if (!catalog || !flowName) return {};
  const index = buildHandlerIndex({ version: 1, run_policies: [], handlers });
  const result: Record<string, RunGraphResolver | null> = {};
  for (const entry of catalog.entries) {
    const handler = matchStepOpenedHandlers(index, `${flowName}.${entry.step_id}`)[0];
    if (!handler) {
      result[entry.step_id] = null;
      continue;
    }
    result[entry.step_id] = {
      handler_id: handler.id,
      type: handler.type,
      ...(handler.type === "view_resolver" ? { view_id: handler.view } : {}),
      config_digest: computeContentDigest(handler),
    };
  }
  return result;
}

/**
 * Project the open steps of a run. A step is open while its memo status is
 * `working`. `resolver` is `null` when no space handler is bound to the step;
 * an authorized protocol client must resolve it externally. The shell must not
 * synthesize a form or fallback control for unbound steps.
 *
 * When a `view_resolver` handler is bound, `view` carries the sanitized View
 * reference (id + origin + entry/shell route) the shell loads without
 * client-side handler matching. The resolver descriptor carries no command,
 * prompt, path, parameter, environment, or secret.
 */
export function buildOpenStepProjections(
  memos: RunStepMemo[],
  catalog: StepContractCatalog | null | undefined,
  context?: OpenStepProjectionContext,
): OpenStepResolverProjection[] {
  if (!catalog) return [];
  const index = context?.handlers
    ? buildHandlerIndex({ version: 1, run_policies: [], handlers: context.handlers })
    : null;
  const viewsById = new Map<string, ProjectedViewRow>();
  for (const view of context?.views ?? []) {
    viewsById.set(view.view_id, view);
  }

  const projections: OpenStepResolverProjection[] = [];
  for (const memo of memos) {
    if (memo.status !== "working") continue;
    const entry = catalogEntryForStep(catalog, memo.step_id);
    if (!entry) continue;

    let resolver: OpenStepResolverProjection["resolver"] = null;
    let view: OpenStepResolverProjection["view"] = null;

    if (index && context?.flow_name) {
      const alias = `${context.flow_name}.${memo.step_id}`;
      const matches = matchStepOpenedHandlers(index, alias);
      const handler = matches[0];
      if (handler) {
        const viewId = handler.type === "view_resolver" ? handler.view : undefined;
        resolver = viewId
          ? { handler_id: handler.id, type: handler.type, view_id: viewId }
          : { handler_id: handler.id, type: handler.type };
        if (viewId) {
          const viewRow = viewsById.get(viewId);
          view = {
            view_id: viewId,
            origin_space_id: context.space_id ?? "",
            ...(viewRow?.manifest.entry ? { entry: viewRow.manifest.entry } : {}),
            ...(viewRow?.manifest.shell_route ? { shell_route: viewRow.manifest.shell_route } : {}),
          };
        }
      }
    }

    projections.push({
      step_id: entry.step_id,
      parent_id: entry.parent_id,
      description: entry.description,
      resolver,
      ...(view ? { view } : {}),
      branches: Object.entries(entry.branches).map(([branch, def]) => ({
        branch,
        schema_ref: def.schema_ref,
        schema: def.schema,
        payload_required: def.payload_required,
        artifact_required: def.artifact_required,
        artifact_slots: def.artifact_slots,
      })),
    });
  }
  return projections;
}
