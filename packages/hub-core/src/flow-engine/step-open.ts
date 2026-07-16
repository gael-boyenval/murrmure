import { HandlerSpecSchema, JOURNAL_EVENT_TYPES, parseHandlerStepBinding } from "@murrmure/contracts";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { resolveSpaceRoot } from "../invoke/resolve.js";
import { flowStepContractCatalog } from "./step-catalog.js";
import {
  buildStepContractSlice,
  writeActiveStepContract,
} from "./step-contract-slice.js";
import { ensureStepWorkdir } from "./step-artifacts.js";
import { persistRunExecContext } from "./exec-context.js";

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
    reason?: "opened" | "resumed";
    state_persisted?: boolean;
  },
): Promise<void> {
  const ts = deps.clock.nowIso();
  const runBare = bareRunId(input.run_id);
  const spaceBare = input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id;

  const run = await deps.studio.getRun(runBare);
  let iterations = {
    ...((run?.exec_context._step_iterations ?? {}) as Record<string, number>),
  };
  if (!input.state_persisted) {
    const existingMemos = await deps.studio.listRunStepMemos(input.run_id);
    const existing = existingMemos.find((memo) => memo.step_id === input.step_id);
    if (!existing || existing.status !== "working") {
      iterations[input.step_id] = (iterations[input.step_id] ?? 0) + 1;
    }
    const assignmentReasons = {
      ...((run?.exec_context._step_assignment_reasons ?? {}) as Record<string, string>),
      [input.step_id]: input.reason ?? "opened",
    };
    const execContext = {
      ...(run?.exec_context ?? input.exec_context),
      _step_iterations: iterations,
      _step_assignment_reasons: assignmentReasons,
    };
    await persistRunExecContext(deps.studio, input.run_id, execContext);

    await deps.studio.upsertRunStepMemo({
      run_id: input.run_id,
      step_id: input.step_id,
      status: "working",
      started_at: ts,
      completed_at: undefined,
      idempotency_key: undefined,
      result_hash: undefined,
      error_code: undefined,
    });
  } else {
    iterations = {
      ...(((await deps.studio.getRun(runBare))?.exec_context._step_iterations ?? {}) as Record<string, number>),
    };
  }

  if (input.journal) {
    await input.journal.append({
      type: JOURNAL_EVENT_TYPES.STEP_OPENED,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      step_id: input.step_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: { reason: input.reason ?? "opened", iteration: iterations[input.step_id] ?? 1 },
    });
  }

  await deps.studio.updateRunLifecycle(runBare, "working", ts);

  const runAfter = await deps.studio.getRun(runBare);
  if (runAfter?.flow_id) {
    const flowEntry = await deps.studio.getFlowIndexEntry(runAfter.flow_id, runAfter.space_id);
    const catalog = flowStepContractCatalog(flowEntry);
    if (catalog) {
      const bindings = await deps.studio.getSpaceBindings(spaceBare);
      const space_root = resolveSpaceRoot(bindings);
      if (space_root) {
        await ensureStepWorkdir(space_root, input.run_id, input.step_id);
        const slice = buildStepContractSlice({
          entry: input.entry,
          catalog,
          exec_context: runAfter.exec_context,
          run_id: input.run_id,
          space_root,
        });
        await writeActiveStepContract({ space_root, run_id: input.run_id, slice });
      }
      await dispatchStepResolverAssignment(deps, {
        flow_name: flowEntry?.name,
        run_id: input.run_id,
        session_id: input.session_id,
        space_id: input.space_id,
        step_id: input.step_id,
        reason: input.reason ?? "opened",
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    }
  }
}

export async function dispatchStepResolverAssignment(
  deps: FlowAdvanceDeps,
  input: {
    flow_name?: string;
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    reason: "opened" | "resumed";
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  if (!input.flow_name) return;
  const rows = await deps.studio.listIndexedHooks(
    input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id,
  );
  const alias = `${input.flow_name}.${input.step_id}`;
  const handler = rows
    .map((row) => HandlerSpecSchema.safeParse(row))
    .find((parsed) => {
      if (!parsed.success) return false;
      const binding = parseHandlerStepBinding(parsed.data.on);
      return binding?.lifecycle === "opened" && binding.alias === alias;
    });
  if (!handler?.success || handler.data.type === "view_resolver") return;
  await deps.dispatchSteps({
    dispatch: [{
      step_id: input.step_id,
      space_id: input.space_id,
      action_name: handler.data.id,
      params: { assignment_reason: input.reason },
    }],
    session_id: input.session_id,
    run_id: input.run_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
  });
}
