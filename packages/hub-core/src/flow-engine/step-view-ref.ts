import type {
  OpenStepResolverProjection,
  RunStepMemo,
  StepContractCatalog,
} from "@murrmure/contracts";
import { catalogEntryForStep } from "./step-catalog.js";

/**
 * Project the open steps of a run. A step is open while its memo status is
 * `working`. `resolver` is `null` when no space handler is bound to the step;
 * an authorized protocol client must resolve it externally. The shell must not
 * synthesize a form or fallback control for unbound steps.
 */
export function buildOpenStepProjections(
  memos: RunStepMemo[],
  catalog: StepContractCatalog | null | undefined,
): OpenStepResolverProjection[] {
  if (!catalog) return [];
  const projections: OpenStepResolverProjection[] = [];
  for (const memo of memos) {
    if (memo.status !== "working") continue;
    const entry = catalogEntryForStep(catalog, memo.step_id);
    if (!entry) continue;
    projections.push({
      step_id: entry.step_id,
      parent_id: entry.parent_id,
      description: entry.description,
      resolver: null,
      branches: Object.entries(entry.branches).map(([branch, def]) => ({
        branch,
        schema_ref: def.schema_ref,
        schema: def.schema,
      })),
    });
  }
  return projections;
}
