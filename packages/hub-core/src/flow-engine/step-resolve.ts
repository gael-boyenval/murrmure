import type {
  HandlerComplete,
  ResolveStepBody,
  RunStepMemo,
  StepCatalogRoute,
  StepContractCatalog,
  StepContractCatalogEntry,
  ContractValidationError,
} from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES, validateBranchContract } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { failRunWithNotification, type SessionRunDeps } from "../run/service.js";
import { cancelStepExecutor, terminateRunExecutors } from "../invoke/run-executor-cancel.js";
import { refreshSessionStatus } from "../session/index.js";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { planLinearSteps } from "./plan.js";
import {
  catalogEntryForStep,
  flowStepContractCatalog,
  parentHasNestedChildren,
  topLevelCatalogSteps,
} from "./step-catalog.js";
import { openStepContract, type StepOpenJournal } from "./step-open.js";
import {
  mergeCheckpointOutputIntoInput,
  mergeStepOutputIntoExecContext,
  persistRunExecContext,
  shouldMergeCheckpointInput,
} from "./exec-context.js";
import { executeStartFlowStep, maybeCompleteFlowCallParent } from "./start-flow.js";
import type { ArtifactRegisterFn } from "./step-artifacts.js";
import {
  mergeArtifactsIntoExecContext,
  promoteArtifactsOut,
  validateArtifactsOut,
} from "./step-artifacts.js";
import { resolveSpaceRoot } from "../invoke/resolve.js";

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
  registerArtifact?: ArtifactRegisterFn;
}

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

function branchRoutes(entry: StepContractCatalogEntry, branch: string): StepCatalogRoute[] {
  return entry.branches[branch]?.routes ?? [];
}

function isFailRoute(routes: StepCatalogRoute[]): boolean {
  return routes.some((r) => r.engine === "fail_run");
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

function resumeTargetFromRoutes(routes: StepCatalogRoute[]): string | undefined {
  return routes.find((r) => r.engine === "resume")?.step_id;
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

function defaultAdvanceDeps(
  deps: StepResolveDeps,
  input: { actor_id: string; token_id: string; advance?: FlowAdvanceDeps },
): FlowAdvanceDeps {
  return (
    input.advance ?? {
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
    }
  );
}

async function openIrStepAfterResolve(
  deps: StepResolveDeps,
  input: {
    run_id: string;
    runBare: string;
    step_id: string;
    exec_context: Record<string, unknown>;
    space_id: string;
    session_id?: string;
    actor_id: string;
    token_id: string;
    advance: FlowAdvanceDeps;
  },
): Promise<boolean> {
  const run = await deps.studio.getRun(input.runBare);
  if (!run?.flow_id) return false;
  const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  const irStep = flowEntry?.ir?.steps.find((step) => step.id === input.step_id);
  if (irStep?.kind !== "start_flow") return false;

  const auth = await input.advance.resolveFlowAuth(run);
  const result = await executeStartFlowStep(input.advance, {
    runBare: input.runBare,
    step_id: input.step_id,
    ir: flowEntry!.ir!,
    spaceId: input.space_id,
    sessionId: input.session_id ?? `ses_${run.session_id}`,
    execContext: input.exec_context,
    actor_id: auth.actor_id,
    token_id: auth.token_id,
    capabilities: auth.capabilities,
    flow_acl: auth.flow_acl,
  });
  return result.ok;
}

async function applyResolvedRoutes(
  deps: StepResolveDeps,
  input: {
    run_id: string;
    runBare: string;
    catalog: StepContractCatalog;
    resolvedEntry: StepContractCatalogEntry;
    routes: StepCatalogRoute[];
    exec_context: Record<string, unknown>;
    resolved_step_id: string;
    space_id: string;
    session_id?: string;
    actor_id: string;
    token_id: string;
    journal: StepResolveJournal;
    advance: FlowAdvanceDeps;
  },
): Promise<void> {
  const { routes } = input;

  const resumeTarget = resumeTargetFromRoutes(routes);
  if (resumeTarget) {
    // Resume returns control to an already-open ancestor without reopening or
    // resolving it. The parent remains open and owns its own resolution.
    const ancestorEntry = catalogEntryForStep(input.catalog, resumeTarget);
    if (ancestorEntry) {
      await deps.studio.upsertRunStepMemo({
        run_id: input.run_id,
        step_id: resumeTarget,
        status: "working",
      });
    }
    return;
  }

  const nextStepId = openTargetFromRoutes(routes);
  if (typeof nextStepId === "string") {
    const topLevelIds = topLevelCatalogSteps(input.catalog).map((e) => e.step_id);
    const stepIndex = topLevelIds.indexOf(input.resolved_step_id);
    if (stepIndex >= 0 && topLevelIds.indexOf(nextStepId) >= 0 && topLevelIds.indexOf(nextStepId) < stepIndex) {
      for (const resetId of stepsToResetForBackwardLoop(topLevelIds, input.resolved_step_id, nextStepId)) {
        await deps.studio.upsertRunStepMemo({
          run_id: input.run_id,
          step_id: resetId,
          status: "pending",
        });
      }
    }

    const nextEntry = catalogEntryForStep(input.catalog, nextStepId);
    if (nextEntry) {
      await openStepContract(input.advance, {
        run_id: input.run_id,
        session_id: input.session_id ?? "",
        space_id: input.space_id,
        step_id: nextStepId,
        entry: nextEntry,
        exec_context: input.exec_context,
        actor_id: input.actor_id,
        token_id: input.token_id,
        journal: input.journal,
      });
    } else {
      await openIrStepAfterResolve(deps, {
        run_id: input.run_id,
        runBare: input.runBare,
        step_id: nextStepId,
        exec_context: input.exec_context,
        space_id: input.space_id,
        session_id: input.session_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
        advance: input.advance,
      });
    }
    return;
  }

  if (isRunCompleteRoute(routes) || nextStepId === null) {
    await completeRunIfFinished(deps, {
      run_id: input.run_id,
      runBare: input.runBare,
      catalog: input.catalog,
      memos: await deps.studio.listRunStepMemos(input.run_id),
      space_id: input.space_id,
      session_id: input.session_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  }
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
  | { ok: false; code: string; message: string; http: number; errors?: ContractValidationError[] }
> {
  const runBare = bareRunId(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id) {
    return { ok: false, code: "RUN_NOT_FOUND", message: "Run not found", http: 404 };
  }

  if (run.lifecycle === "completed" || run.lifecycle === "failed" || run.lifecycle === "cancelled") {
    if (input.body.idempotency_key) {
      const terminalMemo = (await deps.studio.listRunStepMemos(input.run_id)).find(
        (memo) =>
          memo.step_id === input.step_id &&
          memo.idempotency_key === input.body.idempotency_key &&
          (memo.status === "completed" || memo.status === "failed"),
      );
      if (terminalMemo) {
        return {
          ok: true,
          step_id: input.step_id,
          branch: input.body.branch,
          run_id: input.run_id,
          status: terminalMemo.status,
        };
      }
    }
    return {
      ok: false,
      code: "RUN_TERMINAL",
      message: `Run is ${run.lifecycle}; late resolve rejected`,
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

  const entry = catalogEntryForStep(catalog, input.step_id);
  if (!entry) {
    return { ok: false, code: "STEP_NOT_FOUND", message: "Step not in flow catalog", http: 404 };
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

  if (memo.status !== "working") {
    return {
      ok: false,
      code: "STEP_NOT_ACTIVE",
      message: `Step '${input.step_id}' is '${memo.status}', expected working`,
      http: 409,
    };
  }

  const payload = input.body.payload ?? {};
  const artifactError = validateArtifactsOut(input.body.artifacts_out, branchDef.artifact_slots);
  if (artifactError) {
    return { ok: false, code: "INVALID_ARTIFACTS", message: artifactError, http: 400 };
  }
  const files = Object.fromEntries(
    Object.keys(branchDef.artifact_slots).map((slot) => [
      slot,
      (input.body.artifacts_out ?? [])
        .filter((artifact) => artifact.slot === slot)
        .map((artifact) => ({
          name: artifact.name ?? artifact.path,
          media_type: artifact.media_type ?? "",
          size_bytes: artifact.size_bytes ?? 0,
        })),
    ]),
  );
  const contractValidation = validateBranchContract(branchDef, { payload, files });
  if (!contractValidation.ok) {
    return {
      ok: false,
      code: contractValidation.code,
      message: "Branch resolve contract validation failed",
      errors: contractValidation.errors,
      http: 400,
    };
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

  if (input.body.artifacts_out?.length) {
    const spaceBare = input.space_id.startsWith("spc_") ? input.space_id.slice(4) : input.space_id;
    const bindings = await deps.studio.getSpaceBindings(spaceBare);
    const space_root = resolveSpaceRoot(bindings);
    if (!space_root) {
      return {
        ok: false,
        code: "SPACE_ROOT_MISSING",
        message: "artifacts_out requires a linked space root path",
        http: 422,
      };
    }
    try {
      const promoted = await promoteArtifactsOut({
        space_root,
        run_id: input.run_id,
        step_id: input.step_id,
        artifacts_out: input.body.artifacts_out,
        artifact_slots: branchDef.artifact_slots,
        registerArtifact: deps.registerArtifact,
      });
      execContext = mergeArtifactsIntoExecContext(execContext, input.step_id, promoted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Artifact promotion failed";
      return { ok: false, code: "ARTIFACT_PROMOTION_FAILED", message, http: 400 };
    }
  }

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

  cancelStepExecutor(input.run_id, input.step_id);

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
    if (entry.parent_id) {
      await deps.studio.upsertRunStepMemo({
        run_id: input.run_id,
        step_id: entry.parent_id,
        status: "failed",
        completed_at: ts,
      });
    }
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

  const advanceDeps = defaultAdvanceDeps(deps, input);
  await applyResolvedRoutes(deps, {
    run_id: input.run_id,
    runBare,
    catalog,
    resolvedEntry: entry,
    routes,
    exec_context: execContext,
    resolved_step_id: input.step_id,
    space_id: input.space_id,
    session_id: sessionId,
    actor_id: input.actor_id,
    token_id: input.token_id,
    journal: input.journal,
    advance: advanceDeps,
  });

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
    catalog: StepContractCatalog;
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
  terminateRunExecutors({
    run_id: input.run_id,
    executorPollStore: deps.executorPollStore,
    reason: anyFailed ? "run failed" : "run completed",
  });
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

/** Auto-resolve shell-backed handler steps when handler policy is complete:auto. */
export async function maybeAutoResolveExecutorStepAfterAction(
  deps: StepResolveDeps,
  input: {
    run_id: string;
    step_id: string;
    result: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    space_id: string;
    session_id?: string;
    catalog: StepContractCatalog;
    complete_mode?: HandlerComplete;
    journal: StepResolveJournal;
    advance?: FlowAdvanceDeps;
  },
): Promise<boolean> {
  if (input.complete_mode !== "auto") return false;
  const entry = catalogEntryForStep(input.catalog, input.step_id);
  if (!entry || !entry.branches.completed) return false;
  if (parentHasNestedChildren(input.catalog, input.step_id)) {
    throw new Error("HANDLER_COMPLETE_AUTO_NESTED");
  }

  const resolved = await resolveFlowStep(deps, {
    run_id: input.run_id,
    step_id: input.step_id,
    body: { branch: "completed", payload: input.result },
    actor_id: input.actor_id,
    token_id: input.token_id,
    space_id: input.space_id,
    session_id: input.session_id,
    journal: input.journal,
    advance: input.advance,
  });
  return resolved.ok;
}

/** Fail runs when an executor step times out or fails with a fail_run branch. */
export async function maybeAdvanceStepContractFlow(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    step_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  const runBare = bareRunId(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run?.flow_id) return;
  if (run.lifecycle === "completed" || run.lifecycle === "failed" || run.lifecycle === "cancelled") {
    return;
  }

  const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
  const catalog = flowStepContractCatalog(flowEntry);
  if (!catalog) return;

  const memos = await deps.studio.listRunStepMemos(input.run_id);
  const memo = memos.find((m) => m.step_id === input.step_id);
  if (!memo || memo.status !== "failed") return;

  const stepEntry = catalogEntryForStep(catalog, input.step_id);
  const failedBranch = stepEntry?.branches.failed;
  const shouldFailRun = failedBranch?.routes?.some(
    (route) => route.engine === "fail_run",
  );
  if (!shouldFailRun) return;

  await failRunWithNotification(deps, {
    run_id: input.run_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    reason: memo.error_code ?? `step_failed:${input.step_id}`,
  });
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
  catalog: StepContractCatalog,
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
