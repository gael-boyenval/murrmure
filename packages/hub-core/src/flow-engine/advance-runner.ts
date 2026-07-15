import type { Capability, FlowIr, RunStepMemo } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { HubHandler } from "../handlers/hub.js";
import { addSpaceId } from "../bridge/ids.js";
import { createRun, type SessionRunDeps } from "../run/service.js";
import { terminateRunExecutors } from "../invoke/run-executor-cancel.js";
import { refreshSessionStatus } from "../session/index.js";
import {
  isMatrixSiblingRun,
  laneExecContext,
  planMatrixExpansion,
  siblingLaneSteps,
} from "./matrix.js";
import { allSiblingsTerminal, joinParallelStepStatus } from "./join.js";
import { activeStepIndex, buildStepDispatch, nextDispatchAfterComplete } from "./advance.js";
import { planLaneDispatches } from "./graph.js";
import { executeStartFlowStep, maybeCompleteFlowCallParent } from "./start-flow.js";
import type { FlowStepDispatch } from "./types.js";
import { flowUsesStepContracts } from "./step-catalog.js";
import { bootstrapStepContractFlow, maybeAdvanceStepContractFlow } from "./step-resolve.js";

export interface FlowAdvanceAuth {
  actor_id: string;
  token_id: string;
  capabilities: Capability[];
  flow_acl?: string[];
}

export interface FlowAdvanceDeps extends SessionRunDeps {
  studio: StudioPersistencePort;
  handler: HubHandler;
  resolveFlowAuth: (
    run: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>,
  ) => Promise<FlowAdvanceAuth>;
  dispatchSteps: (input: {
    dispatch: FlowStepDispatch[];
    session_id: string;
    run_id: string;
    actor_id: string;
    token_id: string;
  }) => Promise<void>;
}

function bare(id: string): string {
  return id.startsWith("run_") ? id.slice(4) : id.startsWith("ins_") ? id.slice(4) : id;
}

export async function maybeAdvanceFlow(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    step_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const runBare = bare(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id || !run.flow_digest) return;

  const entry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  if (!entry?.ir) return;

  if (flowUsesStepContracts(entry)) {
    await maybeAdvanceStepContractFlow(deps, input);
    return;
  }

  const memos = await deps.studio.listRunStepMemos(`run_${runBare}`);
  const stepMemo = memos.find((m) => m.step_id === input.step_id);
  if (!stepMemo || (stepMemo.status !== "completed" && stepMemo.status !== "failed")) return;

  const spaceId = run.space_id ? addSpaceId(run.space_id) : undefined;
  const sessionId = `ses_${run.session_id}`;

  if (isMatrixSiblingRun(run.exec_context)) {
    await handleSiblingLaneComplete(deps, {
      run,
      runBare,
      memos,
      ir: entry.ir,
      spaceId,
      sessionId,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
    return;
  }

  await tryExpandMatrixOrAdvance(deps, {
    run,
    runBare,
    memos,
    ir: entry.ir,
    spaceId,
    sessionId,
    auth: await deps.resolveFlowAuth(run),
    completed_step_id: input.step_id,
  });
}

async function handleSiblingLaneComplete(
  deps: FlowAdvanceDeps,
  ctx: {
    run: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>;
    runBare: string;
    memos: RunStepMemo[];
    ir: FlowIr;
    spaceId?: string;
    sessionId: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const laneSteps = siblingLaneSteps(ctx.run.exec_context) ?? [];
  const laneComplete = laneSteps.every((s) => {
    const memo = ctx.memos.find((m) => m.step_id === s.id);
    return memo?.status === "completed" || memo?.status === "failed";
  });

  if (!laneComplete) {
    const nextLane = laneSteps.find((s) => {
      const memo = ctx.memos.find((m) => m.step_id === s.id);
      return !memo || memo.status === "pending";
    });
    if (nextLane && nextLane.kind === "invoke") {
      const idx = laneSteps.findIndex((s) => s.id === nextLane.id);
      const dispatch = buildStepDispatch(
        { ...ctx.ir, steps: laneSteps } as FlowIr,
        idx,
        ctx.run.exec_context,
        ctx.spaceId ?? "",
      );
      if (dispatch) {
        await deps.dispatchSteps({
          dispatch: [dispatch],
          session_id: ctx.sessionId,
          run_id: `run_${ctx.runBare}`,
          actor_id: ctx.actor_id,
          token_id: ctx.token_id,
        });
      }
    }
    return;
  }

  const ts = deps.clock.nowIso();
  const failed = ctx.memos.some((m) => m.status === "failed");
  terminateRunExecutors({
    run_id: `run_${ctx.runBare}`,
    executorPollStore: deps.executorPollStore,
    reason: failed ? "run failed" : "run completed",
  });
  await deps.studio.updateRunLifecycle(ctx.runBare, failed ? "failed" : "completed", ts);
  await refreshSessionStatus(deps.studio, ctx.run.session_id);

  const parentBare = bare(String(ctx.run.exec_context._parent_run_id));
  const matrixStepId = String(ctx.run.exec_context._matrix_step_id);
  const parent = await deps.studio.getRun(parentBare);
  if (!parent) return;

  const siblings = (await deps.studio.listRunsBySession(parent.session_id)).filter(
    (r) => r.exec_context._matrix_step_id === matrixStepId && r.run_id !== parentBare,
  );
  const lifecycles = siblings.map((s) => s.lifecycle);
  if (!allSiblingsTerminal(lifecycles)) return;

  const joinStatus = joinParallelStepStatus(lifecycles);
  await deps.studio.upsertRunStepMemo({
    run_id: `run_${parentBare}`,
    step_id: matrixStepId,
    status: joinStatus === "completed" ? "completed" : "failed",
    completed_at: ts,
  });

  if (joinStatus === "completed" && ctx.spaceId) {
    const parentMemos = await deps.studio.listRunStepMemos(`run_${parentBare}`);
    const next = nextDispatchAfterComplete(
      parentMemos,
      ctx.ir,
      parent.exec_context,
      ctx.spaceId,
    );
    if (next) {
      await deps.dispatchSteps({
        dispatch: [next],
        session_id: ctx.sessionId,
        run_id: `run_${parentBare}`,
        actor_id: ctx.actor_id,
        token_id: ctx.token_id,
      });
      return;
    }

    terminateRunExecutors({
      run_id: `run_${parentBare}`,
      executorPollStore: deps.executorPollStore,
      reason: "run completed",
    });
    await deps.studio.updateRunLifecycle(parentBare, "completed", ts);
    await refreshSessionStatus(deps.studio, parent.session_id);
  }
}

async function tryExpandMatrixOrAdvance(
  deps: FlowAdvanceDeps,
  ctx: {
    run: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>;
    runBare: string;
    memos: RunStepMemo[];
    ir: FlowIr;
    spaceId?: string;
    sessionId: string;
    auth: FlowAdvanceAuth;
    completed_step_id: string;
  },
): Promise<void> {
  const ts = deps.clock.nowIso();
  const completedIdx = ctx.ir.steps.findIndex((s) => s.id === ctx.completed_step_id);
  const nextStep = completedIdx >= 0 ? ctx.ir.steps[completedIdx + 1] : undefined;

  if (nextStep?.kind === "parallel" && nextStep.parallel) {
    const parallelMemo = ctx.memos.find((m) => m.step_id === nextStep.id);
    if (!parallelMemo || parallelMemo.status === "pending") {
      const expansion = planMatrixExpansion(
        ctx.ir,
        nextStep.id,
        `run_${ctx.runBare}`,
        ctx.run.exec_context,
      );
      if (expansion?.length) {
        await deps.studio.upsertRunStepMemo({
          run_id: `run_${ctx.runBare}`,
          step_id: nextStep.id,
          status: "working",
          started_at: ts,
        });

        for (const lane of expansion) {
          const existing = await deps.studio.findRunByIdempotencyKey(lane.idempotency_key);
          if (existing) continue;

          const laneContext = laneExecContext(
            {
              ...ctx.run.exec_context,
              _lane_steps: lane.lane_steps,
            },
            lane.item,
            lane.matrix_index,
            `run_${ctx.runBare}`,
            nextStep.id,
          );

          const created = await createRun(deps, {
            session_id: ctx.sessionId,
            space_id: ctx.spaceId,
            flow_id: ctx.run.flow_id ?? undefined,
            flow_digest: ctx.run.flow_digest,
            input_params: { ...laneContext, idempotency_key: lane.idempotency_key },
            reference_run_ids: [`run_${ctx.runBare}`],
            actor_id: ctx.auth.actor_id,
            token_id: ctx.auth.token_id,
            capabilities: ctx.auth.capabilities,
          });
          if ("error" in created) continue;

          const dispatch = planLaneDispatches(lane.lane_steps, laneContext, ctx.spaceId ?? "");
          if (dispatch.length) {
            await deps.dispatchSteps({
              dispatch,
              session_id: ctx.sessionId,
              run_id: created.run.run_id,
              actor_id: ctx.auth.actor_id,
              token_id: ctx.auth.token_id,
            });
          }
        }
        return;
      }
    }
  }

  const freshMemos = await deps.studio.listRunStepMemos(`run_${ctx.runBare}`);
  const pendingStartFlow = await tryStartFlowStepIfPending(deps, {
    ...ctx,
    memos: freshMemos,
  });
  if (pendingStartFlow) return;

  const next = nextDispatchAfterComplete(freshMemos, ctx.ir, ctx.run.exec_context, ctx.spaceId ?? "");
  if (next) {
    await deps.dispatchSteps({
      dispatch: [next],
      session_id: ctx.sessionId,
      run_id: `run_${ctx.runBare}`,
      actor_id: ctx.auth.actor_id,
      token_id: ctx.auth.token_id,
    });
    return;
  }

  const complete = ctx.ir.steps.every((s) => {
    if (s.kind === "parallel") {
      const memo = freshMemos.find((m) => m.step_id === s.id);
      return memo?.status === "completed" || memo?.status === "failed";
    }
    if (s.kind === "invoke" || s.kind === "gate" || s.kind === "start_flow") {
      const memo = freshMemos.find((m) => m.step_id === s.id);
      return memo?.status === "completed";
    }
    return true;
  });
  if (complete) {
    terminateRunExecutors({
      run_id: `run_${ctx.runBare}`,
      executorPollStore: deps.executorPollStore,
      reason: "run completed",
    });
    await deps.studio.updateRunLifecycle(ctx.runBare, "completed", ts);
    if (ctx.spaceId) {
      await deps.handler.appendSpaceJournal({
        type: JOURNAL_EVENT_TYPES.RUN_COMPLETED,
        space_id: ctx.spaceId,
        session_id: ctx.sessionId,
        run_id: `run_${ctx.runBare}`,
        actor_id: ctx.auth.actor_id,
        token_id: ctx.auth.token_id,
        data: {},
      });
    }
    await refreshSessionStatus(deps.studio, ctx.run.session_id);
    const completedRun = await deps.studio.getRun(ctx.runBare);
    if (completedRun) {
      await maybeCompleteFlowCallParent(deps, completedRun, {
        actor_id: ctx.auth.actor_id,
        token_id: ctx.auth.token_id,
      });
    }
  }
}

async function tryStartFlowStepIfPending(
  deps: FlowAdvanceDeps,
  ctx: {
    runBare: string;
    memos: RunStepMemo[];
    ir: FlowIr;
    spaceId?: string;
    sessionId: string;
    auth: FlowAdvanceAuth;
    run: NonNullable<Awaited<ReturnType<StudioPersistencePort["getRun"]>>>;
  },
): Promise<boolean> {
  if (!ctx.spaceId) return false;
  const idx = activeStepIndex(ctx.memos, ctx.ir);
  const plan = ctx.ir.steps.filter(
    (s) => s.kind === "invoke" || s.kind === "gate" || s.kind === "start_flow",
  );
  const step = plan[idx];
  if (!step || step.kind !== "start_flow") return false;
  const memo = ctx.memos.find((m) => m.step_id === step.id);
  if (memo && memo.status !== "pending") return false;

  const result = await executeStartFlowStep(deps, {
    runBare: ctx.runBare,
    step_id: step.id,
    ir: ctx.ir,
    spaceId: ctx.spaceId,
    sessionId: ctx.sessionId,
    execContext: ctx.run.exec_context,
    actor_id: ctx.auth.actor_id,
    token_id: ctx.auth.token_id,
    capabilities: ctx.auth.capabilities,
    flow_acl: ctx.auth.flow_acl,
  });

  if (!result.ok) {
    const ts = deps.clock.nowIso();
    await deps.studio.upsertRunStepMemo({
      run_id: `run_${ctx.runBare}`,
      step_id: step.id,
      status: "failed",
      completed_at: ts,
      error_code: result.code,
    });
    const { failRunWithNotification } = await import("../run/service.js");
    await failRunWithNotification(deps, {
      run_id: `run_${ctx.runBare}`,
      actor_id: ctx.auth.actor_id,
      token_id: ctx.auth.token_id,
      reason: result.code,
    });
    return true;
  }

  return true;
}

export async function bootstrapInitialFlowStep(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const runBare = bare(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id) return;
  const entry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  if (!entry?.ir) return;
  const memos = await deps.studio.listRunStepMemos(`run_${runBare}`);
  const spaceId = run.space_id ? addSpaceId(run.space_id) : undefined;
  if (!spaceId) return;
  const auth = await deps.resolveFlowAuth(run);
  const sessionId = `ses_${run.session_id}`;

  if (flowUsesStepContracts(entry)) {
    await bootstrapStepContractFlow(deps, {
      run_id: `run_${runBare}`,
      session_id: sessionId,
      space_id: spaceId,
      actor_id: input.actor_id,
      token_id: input.token_id,
      journal: {
        append: async (event) => {
          await deps.handler.appendSpaceJournal({
            type: event.type,
            space_id: event.space_id,
            session_id: event.session_id,
            run_id: event.run_id,
            actor_id: event.actor_id,
            token_id: event.token_id,
            data: { ...event.data, step_id: event.step_id },
          });
        },
      },
    });
    return;
  }

  const startedStartFlow = await tryStartFlowStepIfPending(deps, {
    runBare,
    memos,
    ir: entry.ir,
    spaceId,
    sessionId,
    auth,
    run,
  });
  if (startedStartFlow) return;
}
