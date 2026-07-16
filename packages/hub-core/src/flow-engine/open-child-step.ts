import { JOURNAL_EVENT_TYPES, type OpenChildStepBody } from "@murrmure/contracts";
import { cancelStepExecutor } from "../invoke/run-executor-cancel.js";
import { revokeStepResolveCredentials } from "../invoke/run-resolve-credential-registry.js";
import { computeContentDigest } from "../index/digest.js";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { catalogEntryForStep, flowStepContractCatalog, nestedCatalogChildren } from "./step-catalog.js";
import { openStepContract, type StepOpenJournal } from "./step-open.js";

const parentLocks = new Map<string, Promise<void>>();

async function withParentLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = parentLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  parentLocks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (parentLocks.get(key) === queued) parentLocks.delete(key);
  }
}

export type OpenChildStepResult =
  | {
      ok: true;
      run_id: string;
      parent_step_id: string;
      child_step_id: string;
      iteration: number;
      deduplicated: boolean;
    }
  | { ok: false; code: string; message: string; http: 400 | 404 | 409 };

/**
 * Yield one active parent assignment and activate exactly one direct declared
 * child. The keyed critical section makes the state transition deterministic
 * for concurrent clients; stale parent credentials are revoked before child
 * dispatch begins.
 */
export async function openChildStep(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    parent_step_id: string;
    body: OpenChildStepBody;
    actor_id: string;
    token_id: string;
    space_id: string;
    session_id: string;
    journal: StepOpenJournal;
  },
): Promise<OpenChildStepResult> {
  return withParentLock(`${input.run_id}:${input.parent_step_id}`, async () => {
    const runBare = input.run_id.startsWith("run_") ? input.run_id.slice(4) : input.run_id;
    const run = await deps.studio.getRun(runBare);
    if (!run?.flow_id) {
      return { ok: false, code: "RUN_NOT_FOUND", message: "Run not found", http: 404 };
    }
    const requestHash = computeContentDigest({
      parent_step_id: input.parent_step_id,
      child_step_id: input.body.child_step_id,
    });
    const requests = {
      ...((run.exec_context._nested_open_requests ?? {}) as Record<
        string,
        { hash: string; child_step_id: string; iteration: number }
      >),
    };
    const prior = requests[input.body.idempotency_key];
    if (prior) {
      if (prior.hash !== requestHash) {
        return {
          ok: false,
          code: "IDEMPOTENCY_MISMATCH",
          message: "idempotency_key was already used with different child activation arguments",
          http: 409,
        };
      }
      return {
        ok: true,
        run_id: input.run_id,
        parent_step_id: input.parent_step_id,
        child_step_id: prior.child_step_id,
        iteration: prior.iteration,
        deduplicated: true,
      };
    }
    if (["completed", "failed", "cancelled"].includes(run.lifecycle)) {
      return {
        ok: false,
        code: "RUN_TERMINAL",
        message: `Run is ${run.lifecycle}; child activation rejected`,
        http: 409,
      };
    }

    const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
    const catalog = flowStepContractCatalog(flowEntry);
    if (!catalog) {
      return {
        ok: false,
        code: "STEP_CONTRACTS_REQUIRED",
        message: "Run flow does not use step contracts",
        http: 409,
      };
    }
    const parent = catalogEntryForStep(catalog, input.parent_step_id);
    if (!parent) {
      return { ok: false, code: "PARENT_STEP_NOT_FOUND", message: "Parent step not found", http: 404 };
    }

    const declared = nestedCatalogChildren(catalog, input.parent_step_id);
    const child = declared.find((entry) => entry.step_id === input.body.child_step_id);
    if (!child) {
      return {
        ok: false,
        code: "CHILD_NOT_DECLARED",
        message: `'${input.body.child_step_id}' is not a direct declared child of '${input.parent_step_id}'`,
        http: 400,
      };
    }

    const memos = await deps.studio.listRunStepMemos(input.run_id);
    const parentMemo = memos.find((memo) => memo.step_id === input.parent_step_id);
    if (parentMemo?.status !== "working") {
      return {
        ok: false,
        code: "PARENT_NOT_ACTIVE",
        message: `Parent '${input.parent_step_id}' is '${parentMemo?.status ?? "missing"}', expected working`,
        http: 409,
      };
    }
    const activeChild = declared.find((entry) =>
      memos.some((memo) => memo.step_id === entry.step_id && memo.status === "working"),
    );
    if (activeChild) {
      return {
        ok: false,
        code: "CHILD_ALREADY_ACTIVE",
        message: `Parent '${input.parent_step_id}' already has active child '${activeChild.step_id}'`,
        http: 409,
      };
    }

    const iterations = {
      ...((run.exec_context._step_iterations ?? {}) as Record<string, number>),
    };
    const iteration = (iterations[child.step_id] ?? 0) + 1;
    requests[input.body.idempotency_key] = {
      hash: requestHash,
      child_step_id: child.step_id,
      iteration,
    };
    iterations[child.step_id] = iteration;
    const assignmentReasons = {
      ...((run.exec_context._step_assignment_reasons ?? {}) as Record<string, string>),
      [child.step_id]: "opened",
    };
    const nextExecContext = {
      ...run.exec_context,
      _nested_open_requests: requests,
      _step_iterations: iterations,
      _step_assignment_reasons: assignmentReasons,
    };
    const ts = deps.clock.nowIso();
    const transitioned = await deps.studio.transitionNestedChild({
      run_id: input.run_id,
      exec_context: nextExecContext,
      parent_memo: {
        ...parentMemo,
        run_id: input.run_id,
        step_id: input.parent_step_id,
        status: "yielded",
      },
      child_memo: {
        run_id: input.run_id,
        step_id: child.step_id,
        status: "working",
        started_at: ts,
      },
      declared_child_step_ids: declared.map((entry) => entry.step_id),
    });
    if (!transitioned) {
      return {
        ok: false,
        code: "ACTIVATION_CONFLICT",
        message: "Parent assignment changed while activating its child",
        http: 409,
      };
    }

    cancelStepExecutor(input.run_id, input.parent_step_id);
    revokeStepResolveCredentials(input.run_id, input.parent_step_id);
    await input.journal.append({
      type: JOURNAL_EVENT_TYPES.STEP_YIELDED,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      step_id: input.parent_step_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        child_step_id: child.step_id,
        iteration,
        idempotency_key: input.body.idempotency_key,
      },
    });

    const freshRun = await deps.studio.getRun(runBare);
    await openStepContract(deps, {
      run_id: input.run_id,
      session_id: input.session_id,
      space_id: input.space_id,
      step_id: child.step_id,
      entry: child,
      exec_context: freshRun?.exec_context ?? run.exec_context,
      actor_id: input.actor_id,
      token_id: input.token_id,
      journal: input.journal,
      reason: "opened",
      state_persisted: true,
    });

    return {
      ok: true,
      run_id: input.run_id,
      parent_step_id: input.parent_step_id,
      child_step_id: child.step_id,
      iteration,
      deduplicated: false,
    };
  });
}
