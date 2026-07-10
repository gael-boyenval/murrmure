import { HandlerSpecSchema } from "@murrmure/contracts";
import type { HandlerSpec, StepContractCatalogEntry } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { buildHumanStepNotificationDrafts } from "../projections/notifications.js";
import { resolveStepParams } from "./templates.js";
import type { FlowStepDispatch } from "./types.js";
import { resolveSpaceRoot } from "../invoke/resolve.js";
import { flowStepContractCatalog, nestedCatalogChildren, catalogEntryForStep } from "./step-catalog.js";
import { buildHandlerIndex, matchStepOpenedHandlers } from "../index/parse-handlers.js";
import {
  buildStepContractSlice,
  writeActiveStepContract,
  resolveInvokeContractStepId,
} from "./step-contract-slice.js";
import { ensureStepWorkdir } from "./step-artifacts.js";

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

interface ActiveOwnerDispatch {
  owner_step_id: string;
  owner_started_at?: string;
}

const activeOwnerDispatchByRunHandler = new Map<string, ActiveOwnerDispatch>();

function runHandlerKey(run_id: string, handler_id: string): string {
  return `${run_id}:${handler_id}`;
}

function isActiveStepStatus(status: string | undefined): boolean {
  return status === "working" || status === "awaiting_human";
}

function ownerStepIdForHandler(flow_name: string, handler: HandlerSpec): string | undefined {
  if (handler.kill_on !== "step.resolved") return undefined;
  const prefix = `${flow_name}.`;
  const stepIds = (handler.contract_keys ?? [])
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((stepId) => stepId.length > 0);
  if (stepIds.length === 0) return undefined;
  return [...stepIds].sort((a, b) => {
    const depthDiff = a.split(".").length - b.split(".").length;
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  })[0];
}

async function shouldSkipOwnerHandlerDispatch(input: {
  deps: FlowAdvanceDeps;
  run_id: string;
  step_id: string;
  handler: HandlerSpec;
  owner_step_id: string;
}): Promise<boolean> {
  const key = runHandlerKey(input.run_id, input.handler.id);
  const active = activeOwnerDispatchByRunHandler.get(key);
  const memos = await input.deps.studio.listRunStepMemos(input.run_id);
  const ownerMemo = memos.find((memo) => memo.step_id === input.owner_step_id);
  const ownerIsActive = isActiveStepStatus(ownerMemo?.status);

  if (active) {
    const sameOwner = active.owner_step_id === input.owner_step_id;
    const sameGeneration =
      !active.owner_started_at ||
      !ownerMemo?.started_at ||
      ownerMemo.started_at === active.owner_started_at;
    if (sameOwner && ownerIsActive && sameGeneration) {
      return true;
    }
    activeOwnerDispatchByRunHandler.delete(key);
  }

  if (input.step_id !== input.owner_step_id && ownerIsActive) {
    return true;
  }

  return false;
}

async function markOwnerHandlerDispatchActive(input: {
  deps: FlowAdvanceDeps;
  run_id: string;
  handler: HandlerSpec;
  owner_step_id: string;
}): Promise<void> {
  const memos = await input.deps.studio.listRunStepMemos(input.run_id);
  const ownerMemo = memos.find((memo) => memo.step_id === input.owner_step_id);
  activeOwnerDispatchByRunHandler.set(runHandlerKey(input.run_id, input.handler.id), {
    owner_step_id: input.owner_step_id,
    owner_started_at: ownerMemo?.started_at,
  });
}

async function loadIndexedHandlers(
  deps: FlowAdvanceDeps,
  space_id: string,
): Promise<HandlerSpec[]> {
  const bare = space_id.startsWith("spc_") ? space_id.slice(4) : space_id;
  const rows = await deps.studio.listIndexedHooks(bare);
  const handlers: HandlerSpec[] = [];
  for (const row of rows) {
    const parsed = HandlerSpecSchema.safeParse(row);
    if (parsed.success) {
      handlers.push(parsed.data);
    }
  }
  return handlers;
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

export async function openStepContract(
  deps: FlowAdvanceDeps,
  input: {
    run_id: string;
    session_id: string;
    space_id: string;
    step_id: string;
    entry: StepContractCatalogEntry;
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
  const status = input.entry.presentation?.view ? "awaiting_human" : "working";

  await deps.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.step_id,
    status,
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
      data: {
        role: input.entry.role,
        view_id: input.entry.presentation?.view,
      },
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

  if (input.entry.role === "agent") {
    let handlerMatch: HandlerSpec | undefined;
    let handlerOwnerStepId: string | undefined;
    if (run?.flow_id) {
      const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
      if (flowEntry?.name) {
        const contractKey = `${flowEntry.name}.${input.step_id}`;
        const handlers = await loadIndexedHandlers(deps, input.space_id);
        if (handlers.length > 0) {
          const matches = matchStepOpenedHandlers(
            buildHandlerIndex({ version: 1, handlers }),
            contractKey,
          );
          if (matches.length > 1) {
            throw new Error(
              `HANDLER_KEY_CONFLICT: step '${input.step_id}' matched multiple handlers for '${contractKey}'`,
            );
          }
          handlerMatch = matches[0];
          if (handlerMatch) {
            handlerOwnerStepId = ownerStepIdForHandler(flowEntry.name, handlerMatch);
          }
        }
      }
    }

    if (!handlerMatch) {
      throw new Error(
        `HANDLER_NOT_FOUND: step '${input.step_id}' has role=agent but no step.opened handler`,
      );
    }

    const skipOwnerDispatch =
      handlerMatch && handlerOwnerStepId
        ? await shouldSkipOwnerHandlerDispatch({
            deps,
            run_id: input.run_id,
            step_id: input.step_id,
            handler: handlerMatch,
            owner_step_id: handlerOwnerStepId,
          })
        : false;

    const action_name = skipOwnerDispatch ? undefined : handlerMatch.id;
    if (action_name) {
      const space_id = input.space_id;
      const params = resolveStepParams(handlerMatch.params, input.exec_context);
      const dispatch: FlowStepDispatch = {
        step_id: input.step_id,
        space_id,
        action_name,
        params,
      };

      const runForContract = await deps.studio.getRun(runBare);
      if (runForContract?.flow_id) {
        const flowEntry = await deps.studio.getFlowIndexEntry(runForContract.flow_id, runForContract.space_id);
        const catalog = flowStepContractCatalog(flowEntry);
        const bindings = await deps.studio.getSpaceBindings(spaceBare);
        const space_root = resolveSpaceRoot(bindings);
        if (catalog && space_root) {
          const memos = await deps.studio.listRunStepMemos(input.run_id);
          const contractStepId = resolveInvokeContractStepId(input.step_id, memos);
          const contractEntry = catalogEntryForStep(catalog, contractStepId);
          if (contractEntry) {
            await ensureStepWorkdir(space_root, input.run_id, contractStepId);
            const slice = buildStepContractSlice({
              entry: contractEntry,
              exec_context: input.exec_context,
              run_id: input.run_id,
              space_root,
            });
            await writeActiveStepContract({ space_root, run_id: input.run_id, slice });
          }
        }
      }

      await deps.dispatchSteps({
        dispatch: [dispatch],
        session_id: input.session_id,
        run_id: input.run_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });

      if (handlerOwnerStepId) {
        await markOwnerHandlerDispatchActive({
          deps,
          run_id: input.run_id,
          handler: handlerMatch,
          owner_step_id: handlerOwnerStepId,
        });
      }
    }
  }

  await deps.studio.updateRunLifecycle(runBare, status === "awaiting_human" ? "input-required" : "working", ts);

  if (status === "awaiting_human") {
    const space = await deps.studio.getSpace(spaceBare);
    const grants = await deps.studio.listGrants(spaceBare);
    const drafts = buildHumanStepNotificationDrafts({
      notification_id: () => deps.ids.ulid(),
      now: ts,
      step_id: input.step_id,
      run_id: input.run_id,
      session_id: input.session_id,
      space_id: input.space_id,
      space_name: space?.name ?? space?.slug,
      assignees: input.entry.presentation?.assignees,
      expires_at: input.entry.presentation?.expires_at,
      grants,
      can_read_space: (actorId) => {
        const actorGrants = grants.filter((g) => g.actor_id === actorId && g.status === "active");
        return actorGrants.some((g) => g.scopes.includes("space:read"));
      },
      fallback_actor_id: input.actor_id,
    });
    for (const draft of drafts) {
      await deps.studio.insertNotification({
        notification_id: draft.notification_id,
        actor_id: draft.actor_id,
        kind: draft.kind,
        status: draft.status,
        step_id: draft.step_id,
        run_id: draft.run_id?.startsWith("run_") ? draft.run_id.slice(4) : draft.run_id,
        session_id: draft.session_id?.startsWith("ses_") ? draft.session_id.slice(4) : draft.session_id,
        space_id: spaceBare,
        space_hidden: draft.space_hidden ? 1 : 0,
        title: draft.title,
        summary: draft.summary,
        expires_at: draft.expires_at,
        created_at: draft.created_at,
      });
    }
  }

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
