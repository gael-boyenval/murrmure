import type { Capability, FlowIr } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { HubHandler } from "../handlers/hub.js";
import { addSpaceId } from "../bridge/ids.js";
import { createPendingGate, type GateServiceDeps } from "../gates/service.js";
import { failRunWithNotification, type SessionRunDeps } from "../run/service.js";
import { buildCheckpointDispatch, type FlowCheckpointDispatch } from "./checkpoint-dispatch.js";
import {
  CHECKPOINT_BRANCH_MAX_DEPTH,
  checkpointStep,
  checkpointStepIndex,
  isBackwardGoto,
  nextBranchDepth,
  planOnResolveBranch,
  stepsFromGoto,
} from "./checkpoint-resolve.js";
import {
  mergeCheckpointOutputIntoInput,
  mergeStepOutputIntoExecContext,
  persistRunExecContext,
  shouldMergeCheckpointInput,
} from "./exec-context.js";
import { activeStepIndex, buildStepDispatch } from "./advance.js";
import { planLinearSteps } from "./plan.js";
import { executeStartFlowStep } from "./start-flow.js";
import type { FlowAdvanceDeps } from "./advance-runner.js";

export interface CheckpointRunnerDeps extends GateServiceDeps, SessionRunDeps {
  dispatchSteps: FlowAdvanceDeps["dispatchSteps"];
}

function bareRun(id: string): string {
  return id.startsWith("run_") ? id.slice(4) : id;
}

export async function executeCheckpointDispatch(
  deps: CheckpointRunnerDeps,
  input: {
    dispatch: FlowCheckpointDispatch;
    ir: FlowIr;
    run_id: string;
    session_id: string;
    space_id: string;
    exec_context: Record<string, unknown>;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const runBare = bareRun(input.run_id);
  const ts = deps.clock.nowIso();

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.dispatch.step_id,
    status: "working",
    started_at: ts,
  });

  await createPendingGate(deps, {
    run_id: input.run_id,
    session_id: input.session_id,
    space_id: input.space_id,
    step_id: input.dispatch.step_id,
    assignees: input.dispatch.assignees,
    payload_ref: input.dispatch.payload_ref,
    actor_id: input.actor_id,
    token_id: input.token_id,
  });
}

export async function advanceFlowAfterCheckpointResolve(
  deps: CheckpointRunnerDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    disposition: "continue" | "cancel";
    output?: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    capabilities?: Capability[];
    flow_acl?: string[];
  },
): Promise<{ error?: { code: string; message: string } }> {
  const runBare = bareRun(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id || !run.flow_digest) return {};

  const entry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  if (!entry?.ir) return {};

  const step = checkpointStep(entry.ir, input.step_id);
  if (!step?.gate) return {};

  const ts = deps.clock.nowIso();
  const outputBag = input.output ?? {};
  const stepOutput = {
    ...outputBag,
    disposition: input.disposition,
    resolved_at: ts,
    resolved_by: input.actor_id,
  };

  let execContext = mergeStepOutputIntoExecContext(run.exec_context, input.step_id, {
    status: "completed",
    output: stepOutput,
    completed_at: ts,
  });

  const stepIndex = checkpointStepIndex(entry.ir, input.step_id);
  if (
    input.disposition === "continue" &&
    shouldMergeCheckpointInput(stepIndex, step.gate.merge_input)
  ) {
    execContext = mergeCheckpointOutputIntoInput(execContext, outputBag);
  }

  const branch = planOnResolveBranch(step.gate.on_resolve, input.disposition, outputBag);
  if (!branch) {
    await deps.studio.upsertRunStepMemo({
      run_id: input.run_id,
      step_id: input.step_id,
      status: "failed",
      completed_at: ts,
      error_code: "checkpoint_routing_missing",
    });
    await persistRunExecContext(deps.studio, input.run_id, execContext);
    await failRunWithNotification(deps, {
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: "checkpoint_routing_missing",
    });
    return { error: { code: "checkpoint_routing_missing", message: "Checkpoint on_resolve routing missing" } };
  }

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.step_id,
    status: "completed",
    completed_at: ts,
  });

  if (branch.fail) {
    await failRunWithNotification(deps, {
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: input.disposition === "cancel" ? "checkpoint_cancelled" : "checkpoint_failed",
    });
    await persistRunExecContext(deps.studio, input.run_id, execContext);
    return {};
  }

  if (branch.goto) {
    const gotoIndex = planLinearSteps(entry.ir).findIndex((s) => s.id === branch.goto);
    if (gotoIndex < 0) return {};

    if (isBackwardGoto(stepIndex, gotoIndex)) {
      const depth = nextBranchDepth(execContext);
      if (depth > CHECKPOINT_BRANCH_MAX_DEPTH) {
        await failRunWithNotification(deps, {
          run_id: input.run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          reason: "checkpoint_branch_cycle",
        });
        return { error: { code: "checkpoint_branch_cycle", message: "Checkpoint goto depth exceeded" } };
      }
      execContext = { ...execContext, _checkpoint_branch_depth: depth };
    }

    const resetIds = stepsFromGoto(entry.ir, branch.goto);
    for (const resetId of resetIds) {
      await deps.studio.upsertRunStepMemo({
        run_id: input.run_id,
        step_id: resetId,
        status: "pending",
      });
    }

    await persistRunExecContext(deps.studio, input.run_id, execContext);
    await deps.studio.updateRunLifecycle(runBare, "working", undefined);

    const gotoStep = planLinearSteps(entry.ir)[gotoIndex];
    if (gotoStep?.kind === "invoke") {
      const dispatch = buildStepDispatch(entry.ir, gotoIndex, execContext, input.space_id);
      if (dispatch) {
        await deps.dispatchSteps({
          dispatch: [dispatch],
          session_id: input.session_id,
          run_id: input.run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
        });
      }
      return {};
    }

    if (gotoStep?.kind === "gate") {
      const checkpoint = buildCheckpointDispatch(entry.ir, gotoIndex, execContext);
      if (checkpoint) {
        await executeCheckpointDispatch(deps, {
          dispatch: checkpoint,
          ir: entry.ir,
          run_id: input.run_id,
          session_id: input.session_id,
          space_id: input.space_id,
          exec_context: execContext,
          actor_id: input.actor_id,
          token_id: input.token_id,
        });
      }
      return {};
    }

    if (gotoStep?.kind === "start_flow") {
      const result = await executeStartFlowStep(
        { ...deps, dispatchSteps: deps.dispatchSteps } as FlowAdvanceDeps,
        {
          runBare,
          step_id: gotoStep.id,
          ir: entry.ir,
          spaceId: input.space_id,
          sessionId: input.session_id,
          execContext,
          actor_id: input.actor_id,
          token_id: input.token_id,
          capabilities: input.capabilities ?? ["flow:run"],
          flow_acl: input.flow_acl,
        },
      );
      if (!result.ok) {
        await failRunWithNotification(deps, {
          run_id: input.run_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          reason: result.code,
        });
        return { error: { code: result.code, message: result.message } };
      }
      return {};
    }
  }

  await persistRunExecContext(deps.studio, input.run_id, execContext);
  await deps.studio.updateRunLifecycle(runBare, "working", undefined);

  const memos = await deps.studio.listRunStepMemos(input.run_id);
  const idx = activeStepIndex(memos, entry.ir);
  const nextStep = planLinearSteps(entry.ir)[idx];
  if (nextStep?.kind === "invoke") {
    const dispatch = buildStepDispatch(entry.ir, idx, execContext, input.space_id);
    if (dispatch) {
      await deps.dispatchSteps({
        dispatch: [dispatch],
        session_id: input.session_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    }
  } else if (nextStep?.kind === "gate") {
    const checkpoint = buildCheckpointDispatch(entry.ir, idx, execContext);
    if (checkpoint) {
      await executeCheckpointDispatch(deps, {
        dispatch: checkpoint,
        ir: entry.ir,
        run_id: input.run_id,
        session_id: input.session_id,
        space_id: input.space_id,
        exec_context: execContext,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    }
  }

  return {};
}

export async function tryDispatchPendingCheckpoint(
  deps: CheckpointRunnerDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    ir: FlowIr;
    exec_context: Record<string, unknown>;
    actor_id: string;
    token_id: string;
  },
): Promise<boolean> {
  const memos = await deps.studio.listRunStepMemos(input.run_id);
  const idx = activeStepIndex(memos, input.ir);
  const plan = planLinearSteps(input.ir);
  const step = plan[idx];
  if (!step || step.kind !== "gate") return false;

  const memo = memos.find((m) => m.step_id === step.id);
  if (memo && memo.status !== "pending") return false;

  const checkpoint = buildCheckpointDispatch(input.ir, idx, input.exec_context);
  if (!checkpoint) return false;

  await executeCheckpointDispatch(deps, {
    dispatch: checkpoint,
    ir: input.ir,
    run_id: input.run_id,
    session_id: input.session_id,
    space_id: input.space_id,
    exec_context: input.exec_context,
    actor_id: input.actor_id,
    token_id: input.token_id,
  });
  return true;
}
