import type { Capability, FlowIndexEntry, FlowIr, FlowStepIr, RunStepMemo } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { createRun, type SessionRunDeps } from "../run/service.js";
import { canExecuteFlow } from "./start.js";
import { resolveStepParams } from "./templates.js";
import { activeStepIndex } from "./advance.js";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { startFlowRun } from "./run-service.js";

export const FLOW_CALL_MAX_DEPTH = 8;
export const FLOW_CALL_DEPTH_EXCEEDED = "FLOW_CALL_DEPTH_EXCEEDED";

export function flowCallDepth(execContext: Record<string, unknown>): number {
  const depth = execContext._flow_call_depth;
  return typeof depth === "number" ? depth : 0;
}

export function canInvokeFlowCall(
  capabilities: Capability[],
  flow_acl: string[] | undefined,
  targetFlowId: string,
): boolean {
  return canExecuteFlow(capabilities, flow_acl, targetFlowId);
}

function bare(id: string): string {
  return id.startsWith("run_") ? id.slice(4) : id.startsWith("ses_") ? id.slice(4) : id;
}

function findStartFlowStep(ir: FlowIr, stepId: string): FlowStepIr | undefined {
  return ir.steps.find((s) => s.id === stepId && s.kind === "start_flow");
}

export async function executeStartFlowStep(
  deps: FlowAdvanceDeps,
  input: {
    runBare: string;
    step_id: string;
    ir: FlowIr;
    spaceId: string;
    sessionId: string;
    execContext: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
    flow_acl?: string[];
  },
): Promise<{ ok: true; child_run_id?: string; waiting: boolean } | { ok: false; code: string; message: string }> {
  const step = findStartFlowStep(input.ir, input.step_id);
  if (!step?.start_flow) {
    return { ok: false, code: "STEP_NOT_FOUND", message: "start_flow step not found in IR" };
  }

  const parentDepth = flowCallDepth(input.execContext);
  if (parentDepth >= FLOW_CALL_MAX_DEPTH) {
    return {
      ok: false,
      code: FLOW_CALL_DEPTH_EXCEEDED,
      message: `Flow-call depth limit (${FLOW_CALL_MAX_DEPTH}) exceeded`,
    };
  }

  const targetFlowId = step.start_flow.flow_id;
  const spaceBare = stripSpaceId(input.spaceId);
  const entry = await deps.studio.getFlowIndexEntry(targetFlowId, spaceBare);
  if (!entry) {
    return { ok: false, code: "FLOW_NOT_FOUND", message: `Target flow '${targetFlowId}' not indexed` };
  }

  if (!canInvokeFlowCall(input.capabilities, input.flow_acl, targetFlowId)) {
    return {
      ok: false,
      code: "SCOPE_ENFORCEMENT_FAILURE",
      message: `Grant lacks flow:run for '${targetFlowId}'`,
    };
  }

  const ts = deps.clock.nowIso();
  const idempotencyKey = `${input.runBare}:${input.step_id}:start_flow`;
  const existing = await deps.studio.findRunByIdempotencyKey(idempotencyKey);
  if (existing) {
    const childRunId = `run_${existing.run_id}`;
    const wait = step.start_flow.wait !== false;
    if (wait && !isRunTerminal(existing.lifecycle)) {
      return { ok: true, child_run_id: childRunId, waiting: true };
    }
    return { ok: true, child_run_id: childRunId, waiting: false };
  }

  const flowInput = resolveStepParams(step.start_flow.input, input.execContext) ?? {};
  const childDepth = parentDepth + 1;
  const childContext: Record<string, unknown> = {
    input: flowInput,
    _flow_call_depth: childDepth,
    _flow_call: true,
    _parent_run_id: `run_${input.runBare}`,
    _parent_step_id: input.step_id,
  };

  await deps.studio.upsertRunStepMemo({
    run_id: `run_${input.runBare}`,
    step_id: input.step_id,
    status: "working",
    started_at: ts,
    idempotency_key: idempotencyKey,
  });

  const started = await startFlowRun(
    { studio: deps.studio, handler: deps.handler, ids: deps.ids, clock: deps.clock, cancelTimeoutMs: deps.cancelTimeoutMs, guard: deps.guard },
    {
      entry,
      space_id: input.spaceId,
      session_id: input.sessionId,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities,
      flow_acl: input.flow_acl,
      input: flowInput,
      idempotency_header: idempotencyKey,
      mode: "flow_call",
      reference_run_ids: [`run_${input.runBare}`],
      exec_context: childContext,
    },
  );

  if (!started.ok) {
    await deps.studio.upsertRunStepMemo({
      run_id: `run_${input.runBare}`,
      step_id: input.step_id,
      status: "failed",
      completed_at: ts,
      error_code: started.error.code,
    });
    return { ok: false, code: started.error.code, message: started.error.message };
  }

  if (input.spaceId) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.FLOW_CHILD_STARTED,
      space_id: input.spaceId,
      session_id: input.sessionId,
      run_id: `run_${input.runBare}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        step_id: input.step_id,
        child_run_id: started.run_id,
        target_flow_id: targetFlowId,
        parent_step_id: input.step_id,
      },
    });
  }

  if (!started.deduplicated && started.dispatch.length) {
    await deps.dispatchSteps({
      dispatch: started.dispatch,
      session_id: input.sessionId,
      run_id: started.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  } else if (!started.deduplicated) {
    await maybeDispatchInitialStartFlow(deps, {
      child_run_id: started.run_id,
      entry,
      session_id: input.sessionId,
      space_id: input.spaceId,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities,
      flow_acl: input.flow_acl,
    });
  }

  const wait = step.start_flow.wait !== false;
  if (!wait) {
    await deps.studio.upsertRunStepMemo({
      run_id: `run_${input.runBare}`,
      step_id: input.step_id,
      status: "completed",
      completed_at: ts,
    });
  }

  return { ok: true, child_run_id: started.run_id, waiting: wait };
}

async function maybeDispatchInitialStartFlow(
  deps: FlowAdvanceDeps,
  input: {
    child_run_id: string;
    entry: FlowIndexEntry;
    session_id: string;
    space_id: string;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
    flow_acl?: string[];
  },
): Promise<void> {
  if (!input.entry.ir) return;
  const childBare = bare(input.child_run_id);
  const childRun = await deps.studio.getRun(childBare);
  if (!childRun) return;

  const idx = activeStepIndex([], input.entry.ir);
  const step = input.entry.ir.steps[idx];
  if (step?.kind !== "start_flow") return;

  const result = await executeStartFlowStep(deps, {
    runBare: childBare,
    step_id: step.id,
    ir: input.entry.ir,
    spaceId: input.space_id,
    sessionId: input.session_id,
    execContext: childRun.exec_context,
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities,
    flow_acl: input.flow_acl,
  });

  if (!result.ok) {
    const ts = deps.clock.nowIso();
    await deps.studio.upsertRunStepMemo({
      run_id: input.child_run_id,
      step_id: step.id,
      status: "failed",
      completed_at: ts,
      error_code: result.code,
    });
    const { failRunWithNotification } = await import("../run/service.js");
    const failed = await failRunWithNotification(deps, {
      run_id: input.child_run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: result.code,
    });
    if (failed.run) {
      const childRow = await deps.studio.getRun(childBare);
      if (childRow) {
        await maybeCompleteFlowCallParent(deps, { ...childRow, lifecycle: "failed" }, {
          actor_id: input.actor_id,
          token_id: input.token_id,
        });
      }
    }
  }
}

function isRunTerminal(lifecycle: string): boolean {
  return lifecycle === "completed" || lifecycle === "failed" || lifecycle === "cancelled";
}

export async function maybeCompleteFlowCallParent(
  deps: FlowAdvanceDeps,
  childRun: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>,
  input: { actor_id: string; token_id: string },
): Promise<void> {
  const parentRunId = childRun.exec_context._parent_run_id;
  const parentStepId = childRun.exec_context._parent_step_id;
  if (typeof parentRunId !== "string" || typeof parentStepId !== "string") return;
  if (!isRunTerminal(childRun.lifecycle)) return;

  const parentBare = bare(parentRunId);
  const parent = await deps.studio.getRun(parentBare);
  if (!parent?.flow_id || !parent.flow_digest) return;

  const entry = await deps.studio.getFlowIndexEntry(parent.flow_id, parent.space_id);
  if (!entry?.ir) return;

  const step = findStartFlowStep(entry.ir, parentStepId);
  if (!step?.start_flow) return;

  const memos = await deps.studio.listRunStepMemos(`run_${parentBare}`);
  const stepMemo = memos.find((m) => m.step_id === parentStepId);
  if (!stepMemo || stepMemo.status === "completed" || stepMemo.status === "failed") return;

  const ts = deps.clock.nowIso();
  const childFailed = childRun.lifecycle === "failed" || childRun.lifecycle === "cancelled";
  const continueOnError = step.start_flow.continue_on_error === true;
  const stepStatus: RunStepMemo["status"] =
    childFailed && !continueOnError ? "failed" : "completed";

  await deps.studio.upsertRunStepMemo({
    run_id: `run_${parentBare}`,
    step_id: parentStepId,
    status: stepStatus,
    completed_at: ts,
    error_code: childFailed && !continueOnError ? "CHILD_RUN_FAILED" : undefined,
  });

  const spaceId = parent.space_id ? addSpaceId(parent.space_id) : undefined;
  if (spaceId) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.FLOW_CHILD_COMPLETED,
      space_id: spaceId,
      session_id: `ses_${parent.session_id}`,
      run_id: `run_${parentBare}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        step_id: parentStepId,
        child_run_id: `run_${childRun.run_id}`,
        child_lifecycle: childRun.lifecycle,
        parent_step_id: parentStepId,
        step_status: stepStatus,
      },
    });
  }

  if (stepStatus === "completed" && spaceId) {
    const { nextDispatchAfterComplete } = await import("./advance.js");
    const next = nextDispatchAfterComplete(
      await deps.studio.listRunStepMemos(`run_${parentBare}`),
      entry.ir,
      parent.exec_context,
      spaceId,
    );
    if (next) {
      await deps.dispatchSteps({
        dispatch: [next],
        session_id: `ses_${parent.session_id}`,
        run_id: `run_${parentBare}`,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    } else {
      await advanceParentIfComplete(deps, {
        parentBare,
        parent,
        ir: entry.ir,
        spaceId,
        sessionId: `ses_${parent.session_id}`,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    }
  } else if (stepStatus === "failed") {
    const { failRunWithNotification } = await import("../run/service.js");
    await failRunWithNotification(deps, {
      run_id: `run_${parentBare}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: "child_flow_failed",
    });
    const failedParent = await deps.studio.getRun(parentBare);
    if (failedParent?.exec_context._parent_run_id) {
      await maybeCompleteFlowCallParent(
        deps,
        { ...failedParent, lifecycle: "failed" },
        input,
      );
    }
  }
}

async function advanceParentIfComplete(
  deps: FlowAdvanceDeps,
  ctx: {
    parentBare: string;
    parent: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>;
    ir: FlowIr;
    spaceId: string;
    sessionId: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const memos = await deps.studio.listRunStepMemos(`run_${ctx.parentBare}`);
  const complete = ctx.ir.steps.every((s) => {
    if (s.kind === "parallel") {
      const memo = memos.find((m) => m.step_id === s.id);
      return memo?.status === "completed" || memo?.status === "failed";
    }
    if (s.kind === "invoke" || s.kind === "gate" || s.kind === "start_flow") {
      const memo = memos.find((m) => m.step_id === s.id);
      return memo?.status === "completed";
    }
    return true;
  });
  if (complete) {
    const ts = deps.clock.nowIso();
    await deps.studio.updateRunLifecycle(ctx.parentBare, "completed", ts);
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_COMPLETED,
      space_id: ctx.spaceId,
      session_id: ctx.sessionId,
      run_id: `run_${ctx.parentBare}`,
      actor_id: ctx.actor_id,
      token_id: ctx.token_id,
      data: {},
    });
    const { refreshSessionStatus } = await import("../session/index.js");
    await refreshSessionStatus(deps.studio, ctx.parent.session_id);
  }
}

export type StartFlowCallDeps = SessionRunDeps;
