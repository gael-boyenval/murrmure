import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { resolveSpaceRoot } from "../invoke/resolve.js";
import { flowStepContractCatalog, nestedCatalogChildren } from "./step-catalog.js";
import {
  buildStepContractSlice,
  writeActiveStepContract,
} from "./step-contract-slice.js";
import { ensureStepWorkdir } from "./step-artifacts.js";

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

export interface StepOpenJournal {
  append(input: {
    type: string;
    space_id: string;
    session_id?: string;
    run_id: string;
    step_id: string;
    actor_id: string;
    token_id: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Open a step under the generic `open` lifecycle. The step becomes `working`
 * and waits to be resolved by an authorized protocol client or a space-bound
 * handler. No resolver modality is inferred: a step with no configured resolver
 * is valid and externally resolvable (`resolver: null`). The shell must not
 * synthesize a form or fallback control for unbound steps.
 */
export async function openStepContract(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    entry: import("@murrmure/contracts").StepContractCatalogEntry;
    exec_context: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    journal?: StepOpenJournal;
    /** When true, do not auto-open first nested child (internal reopen). */
    skip_nested_bootstrap?: boolean;
  },
): Promise<void> {
  const ts = deps.clock.nowIso();
  const runBare = bareRunId(input.run_id);
  const spaceBare = input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id;

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.step_id,
    status: "working",
    started_at: ts,
  });

  if (input.journal) {
    await input.journal.append({
      type: JOURNAL_EVENT_TYPES.STEP_OPENED,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      step_id: input.step_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {},
    });
  }

  const run = await deps.studio.getRun(runBare);
  let bootstrappedChild = false;
  if (run?.flow_id) {
    const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
    const catalog = flowStepContractCatalog(flowEntry);
    if (catalog && !input.skip_nested_bootstrap && !input.entry.parent_id) {
      const children = nestedCatalogChildren(catalog, input.step_id);
      const firstChild = children[0];
      if (firstChild) {
        bootstrappedChild = true;
        await openStepContract(deps, {
          run_id: input.run_id,
          session_id: input.session_id,
          space_id: input.space_id,
          step_id: firstChild.step_id,
          entry: firstChild,
          exec_context: input.exec_context,
          actor_id: input.actor_id,
          token_id: input.token_id,
          journal: input.journal,
          skip_nested_bootstrap: true,
        });
      }
    }
  }

  await deps.studio.updateRunLifecycle(runBare, "working", ts);

  const runAfter = await deps.studio.getRun(runBare);
  if (runAfter?.flow_id) {
    const flowEntry = await deps.studio.getFlowIndexEntry(runAfter.flow_id, runAfter.space_id);
    const catalog = flowStepContractCatalog(flowEntry);
    if (catalog && !bootstrappedChild) {
      const bindings = await deps.studio.getSpaceBindings(spaceBare);
      const space_root = resolveSpaceRoot(bindings);
      if (space_root) {
        await ensureStepWorkdir(space_root, input.run_id, input.step_id);
        const slice = buildStepContractSlice({
          entry: input.entry,
          exec_context: input.exec_context,
          run_id: input.run_id,
          space_root,
        });
        await writeActiveStepContract({ space_root, run_id: input.run_id, slice });
      }
    }
  }
}
