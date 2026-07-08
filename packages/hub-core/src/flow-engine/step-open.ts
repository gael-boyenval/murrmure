import type { StepContractCatalogEntry } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { FlowAdvanceDeps } from "./advance-runner.js";
import { buildHumanStepNotificationDrafts } from "../projections/notifications.js";
import { resolveStepParams, resolveStepSpace } from "./templates.js";
import type { FlowStepDispatch } from "./types.js";
import { resolveSpaceRoot } from "../invoke/resolve.js";
import { flowStepContractCatalog } from "./step-catalog.js";
import { buildStepContractSlice, writeActiveStepContract } from "./step-contract-slice.js";

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

  if (input.entry.executor?.action) {
    const space_id = resolveStepSpace(input.entry.executor.space ?? "{{origin_space}}", input.space_id);
    const params = resolveStepParams(input.entry.executor.params, input.exec_context);
    const dispatch: FlowStepDispatch = {
      step_id: input.step_id,
      space_id,
      action_name: input.entry.executor.action,
      params,
    };
    await deps.dispatchSteps({
      dispatch: [dispatch],
      session_id: input.session_id,
      run_id: input.run_id,
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
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

  const run = await deps.studio.getRun(runBare);
  if (run?.flow_id) {
    const flowEntry = await deps.studio.getFlowIndexEntry(run.flow_id, run.space_id);
    const catalog = flowStepContractCatalog(flowEntry);
    const bindings = await deps.studio.getSpaceBindings(spaceBare);
    const space_root = resolveSpaceRoot(bindings);
    if (catalog && space_root) {
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
