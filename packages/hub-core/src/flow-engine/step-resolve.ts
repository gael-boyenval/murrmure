import type { ResolveStepBody, RunStepMemo, StepCatalogRoute } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { failRunWithNotification, type SessionRunDeps } from "../run/service.js";
import { refreshSessionStatus } from "../session/index.js";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { planLinearSteps } from "./plan.js";
import {
  catalogEntryForStep,
  flowStepContractCatalog,
  isTopLevelStepContractStep,
  topLevelCatalogSteps,
} from "./step-catalog.js";
import { openStepContract, type StepOpenJournal } from "./step-open.js";
import {
  mergeCheckpointOutputIntoInput,
  mergeStepOutputIntoExecContext,
  persistRunExecContext,
  shouldMergeCheckpointInput,
} from "./exec-context.js";
import { maybeCompleteFlowCallParent } from "./start-flow.js";

export interface StepResolveJournal extends StepOpenJournal {
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

export interface StepResolveDeps extends SessionRunDeps {
  studio: StudioPersistencePort;
  handler: HubHandler;
  dispatchSteps: FlowAdvanceDeps["dispatchSteps"];
}

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

function validatePayloadSchema(
  schema: Record<string, unknown> | undefined,
  payload: Record<string, unknown>,
): string | null {
  if (!schema || schema.type !== "object") return null;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null) {
      return `Missing required field '${key}' in resolve payload`;
    }
  }
  return null;
}

function branchRoutes(entry: NonNullable<ReturnType<typeof catalogEntryForStep>>, branch: string): StepCatalogRoute[] {
  return entry.branches[branch]?.routes ?? [];
}

function isFailRoute(routes: StepCatalogRoute[]): boolean {
  return routes.some((r) => r.fail_run === true || r.engine === "fail_run");
}

function openTargetFromRoutes(routes: StepCatalogRoute[]): string | null | undefined {
  for (const route of routes) {
    if (route.engine === "open" && route.step_id) return route.step_id;
  }
  return undefined;
}

function isRunCompleteRoute(routes: StepCatalogRoute[]): boolean {
  return routes.some((r) => r.engine === "advance") && !routes.some((r) => r.engine === "open");
}

function stepsToResetForBackwardLoop(
  catalogStepIds: string[],
  fromStepId: string,
  toStepId: string,
): string[] {
  const fromIdx = catalogStepIds.indexOf(fromStepId);
  const toIdx = catalogStepIds.indexOf(toStepId);
  if (fromIdx < 0 || toIdx < 0 || toIdx >= fromIdx) return [];
  return catalogStepIds.slice(toIdx);
}

export async function resolveFlowStep(
  deps: StepResolveDeps,
  input: {
    run_id: string;
    step_id: string;
    body: ResolveStepBody;
    actor_id: string;
    token_id: string;
    space_id: string;
    session_id?: string;
    journal: StepResolveJournal;
    advance?: FlowAdvanceDeps;
  },
): Promise<
  | { ok: true; step_id: string; branch: string; run_id: string; status: RunStepMemo["status"] }
  | { ok: false; code: string; message: string; http: number }
> {
  const runBare = bareRunId(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id) {
    return { ok: false, code: "RUN_NOT_FOUND", message: "Run not found", http: 404 };
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

  const entry = catalogEntryForStep(catalog, input.step_id);
  if (!entry) {
    return { ok: false, code: "STEP_NOT_FOUND", message: "Step not in flow catalog", http: 404 };
  }

  if (!isTopLevelStepContractStep(catalog, input.step_id)) {
    return {
      ok: false,
      code: "NESTED_STEP_UNSUPPORTED",
      message: "Nested step resolve is not supported until VS-7",
      http: 409,
    };
  }

  const branchDef = entry.branches[input.body.branch];
  if (!branchDef) {
    return {
      ok: false,
      code: "BRANCH_NOT_FOUND",
      message: `Unknown branch '${input.body.branch}' for step '${input.step_id}'`,
      http: 400,
    };
  }

  const memos = await deps.studio.listRunStepMemos(input.run_id);
  const memo = memos.find((m) => m.step_id === input.step_id);
  if (!memo) {
    return { ok: false, code: "STEP_NOT_FOUND", message: "Step memo not found", http: 404 };
  }

  if (memo.status === "completed" || memo.status === "failed") {
    if (input.body.idempotency_key && memo.idempotency_key === input.body.idempotency_key) {
      return {
        ok: true,
        step_id: input.step_id,
        branch: input.body.branch,
        run_id: input.run_id,
        status: memo.status,
      };
    }
    return {
      ok: false,
      code: "STEP_TERMINAL",
      message: `Step '${input.step_id}' is already ${memo.status}`,
      http: 409,
    };
  }

  if (memo.status !== "working" && memo.status !== "awaiting_human") {
    return {
      ok: false,
      code: "STEP_NOT_ACTIVE",
      message: `Step '${input.step_id}' is '${memo.status}', expected working or awaiting_human`,
      http: 409,
    };
  }

  const payload = input.body.payload ?? {};
  const schemaError = validatePayloadSchema(branchDef.schema, payload);
  if (schemaError) {
    return { ok: false, code: "INVALID_PAYLOAD", message: schemaError, http: 400 };
  }

  const ts = deps.clock.nowIso();
  const routes = branchRoutes(entry, input.body.branch);
  const failRun = isFailRoute(routes);
  const nextStatus: RunStepMemo["status"] = failRun ? "failed" : "completed";

  const stepOutput = {
    ...payload,
    branch: input.body.branch,
    resolved_at: ts,
    resolved_by: input.actor_id,
  };

  let execContext = mergeStepOutputIntoExecContext(run.exec_context, input.step_id, {
    status: nextStatus === "failed" ? "failed" : "completed",
    output: stepOutput,
    completed_at: ts,
  });

  const topLevelIds = topLevelCatalogSteps(catalog).map((e) => e.step_id);
  const stepIndex = topLevelIds.indexOf(input.step_id);
  if (!failRun && shouldMergeCheckpointInput(stepIndex, true)) {
    execContext = mergeCheckpointOutputIntoInput(execContext, payload);
  }

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.step_id,
    status: nextStatus,
    completed_at: ts,
    idempotency_key: input.body.idempotency_key,
  });

  await persistRunExecContext(deps.studio, input.run_id, execContext);

  const sessionId = input.session_id ?? (run.session_id ? `ses_${run.session_id}` : undefined);
  await input.journal.append({
    type: JOURNAL_EVENT_TYPES.STEP_RESOLVED,
    space_id: input.space_id,
    session_id: sessionId,
    run_id: input.run_id,
    step_id: input.step_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: {
      branch: input.body.branch,
      payload,
      artifacts_out: input.body.artifacts_out,
    },
  });

  if (failRun) {
    await failRunWithNotification(deps, {
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      reason: input.body.branch,
    });
    return {
      ok: true,
      step_id: input.step_id,
      branch: input.body.branch,
      run_id: input.run_id,
      status: "failed",
    };
  }

  const nextStepId = openTargetFromRoutes(routes);
  const advanceDeps = input.advance ?? {
    studio: deps.studio,
    handler: deps.handler,
    ids: deps.ids,
    clock: deps.clock,
    cancelTimeoutMs: deps.cancelTimeoutMs,
    resolveFlowAuth: async () => ({
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: ["flow:run", "action:invoke"],
    }),
    dispatchSteps: deps.dispatchSteps,
  };

  if (typeof nextStepId === "string") {
    if (stepIndex >= 0 && topLevelIds.indexOf(nextStepId) >= 0 && topLevelIds.indexOf(nextStepId) < stepIndex) {
      for (const resetId of stepsToResetForBackwardLoop(topLevelIds, input.step_id, nextStepId)) {
        await deps.studio.upsertRunStepMemo({
          run_id: input.run_id,
          step_id: resetId,
          status: "pending",
        });
      }
    }

    const nextEntry = catalogEntryForStep(catalog, nextStepId);
    if (nextEntry) {
      await openStepContract(advanceDeps, {
        run_id: input.run_id,
        session_id: sessionId ?? "",
        space_id: input.space_id,
        step_id: nextStepId,
        entry: nextEntry,
        exec_context: execContext,
        actor_id: input.actor_id,
        token_id: input.token_id,
        journal: input.journal,
      });
    }
  } else if (isRunCompleteRoute(routes) || nextStepId === null) {
    await completeRunIfFinished(deps, {
      run_id: input.run_id,
      runBare,
      catalog,
      memos: await deps.studio.listRunStepMemos(input.run_id),
      space_id: input.space_id,
      session_id: sessionId,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  }

  return {
    ok: true,
    step_id: input.step_id,
    branch: input.body.branch,
    run_id: input.run_id,
    status: "completed",
  };
}

async function completeRunIfFinished(
  deps: StepResolveDeps,
  input: {
    run_id: string;
    runBare: string;
    catalog: NonNullable<ReturnType<typeof flowStepContractCatalog>>;
    memos: RunStepMemo[];
    space_id: string;
    session_id?: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const topLevel = topLevelCatalogSteps(input.catalog);
  const allDone = topLevel.every((step) => {
    const memo = input.memos.find((m) => m.step_id === step.step_id);
    return memo?.status === "completed" || memo?.status === "failed";
  });
  if (!allDone) return;

  const anyFailed = input.memos.some((m) => m.status === "failed");
  const ts = deps.clock.nowIso();
  await deps.studio.updateRunLifecycle(input.runBare, anyFailed ? "failed" : "completed", ts);
  if (!anyFailed && input.session_id) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_COMPLETED,
      space_id: input.space_id,
      session_id: input.session_id,
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {},
    });
  }
  const run = await deps.studio.getRun(input.runBare);
  if (run) {
    await refreshSessionStatus(deps.studio, run.session_id);
    await maybeCompleteFlowCallParent(
      {
        studio: deps.studio,
        handler: deps.handler,
        ids: deps.ids,
        clock: deps.clock,
        cancelTimeoutMs: deps.cancelTimeoutMs,
        resolveFlowAuth: async () => ({
          actor_id: input.actor_id,
          token_id: input.token_id,
          capabilities: ["flow:run", "action:invoke"],
        }),
        dispatchSteps: async () => undefined,
      },
      run,
      { actor_id: input.actor_id, token_id: input.token_id },
    );
  }
}

export async function bootstrapStepContractFlow(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    actor_id: string;
    token_id: string;
    journal?: StepOpenJournal;
  },
): Promise<boolean> {
  const runBare = bareRunId(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id) return false;

  const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  const catalog = flowStepContractCatalog(flowEntry);
  if (!catalog) return false;

  const memos = await deps.studio.listRunStepMemos(input.run_id);
  const topLevel = topLevelCatalogSteps(catalog);
  if (topLevel.length === 0) return false;

  const anyStarted = memos.some((m) => topLevel.some((s) => s.step_id === m.step_id && m.status !== "pending"));
  if (anyStarted) return false;

  const first = topLevel[0]!;
  await openStepContract(deps, {
    run_id: input.run_id,
    session_id: input.session_id,
    space_id: input.space_id,
    step_id: first.step_id,
    entry: first,
    exec_context: run.exec_context,
    actor_id: input.actor_id,
    token_id: input.token_id,
    journal: input.journal,
  });
  return true;
}

export function stepContractAdvanceComplete(
  memos: RunStepMemo[],
  catalog: NonNullable<ReturnType<typeof flowStepContractCatalog>>,
): boolean {
  const topLevel = topLevelCatalogSteps(catalog);
  return topLevel.every((step) => {
    const memo = memos.find((m) => m.step_id === step.step_id);
    return memo?.status === "completed";
  });
}

export function planLinearStepContractSteps(ir: import("@murrmure/contracts").FlowIr): string[] {
  return planLinearSteps(ir)
    .filter((s) => s.kind === "step_contract")
    .map((s) => s.id);
}
