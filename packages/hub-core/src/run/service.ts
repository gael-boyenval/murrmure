import type { Capability, RunLifecycle, SessionCreatedBy } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { HubHandler } from "../handlers/hub.js";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { ExecutorPollStore } from "../executors/queue-store.js";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { canStartFlow } from "../grants/migrate.js";
import {
  buildRunFailedNotificationDraft,
  resolveRunFailedNotificationRecipients,
  runFailedNotificationCopy,
} from "../projections/notifications.js";
import { cancelRunExecutors, terminateRunExecutors } from "../invoke/run-executor-cancel.js";
import { instanceStateToLifecycle, runIdToInstanceId } from "./lifecycle.js";
import { toRunDto, refreshSessionStatus, toSessionDto } from "../session/index.js";
import { deriveSessionStatus } from "../session/status.js";
import { SpaceConcurrencyGuard, spaceRunGuard } from "./space-guard.js";
import { admitFlowRun, type FlowAdmissionError } from "./admission.js";

export interface SessionRunDeps {
  studio: StudioPersistencePort;
  handler: HubHandler;
  ids: { ulid: () => string };
  clock: { nowIso: () => string };
  cancelTimeoutMs?: number;
  executorPollStore?: ExecutorPollStore;
  /** Per-space coordination guard shared with apply; defaults to the in-process singleton. */
  guard?: SpaceConcurrencyGuard;
}

function bare(id: string): string {
  const idx = id.indexOf("_");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function prefixedRun(bareId: string): string {
  return bareId.startsWith("run_") ? bareId : `run_${bareId}`;
}

function prefixedSession(bareId: string): string {
  return bareId.startsWith("ses_") ? bareId : `ses_${bareId}`;
}

function actorCanReadSpaceForNotification(
  actor_id: string,
  grants: Array<{ actor_id: string; status: string; scopes: string[] }>,
  sessionActorId?: string,
): boolean {
  if (sessionActorId && actor_id === sessionActorId) return true;
  return grants.some(
    (g) => g.actor_id === actor_id && g.status === "active" && g.scopes.includes("space:read"),
  );
}

export async function failRunWithNotification(
  deps: SessionRunDeps,
  input: {
    run_id: string;
    actor_id: string;
    token_id: string;
    reason?: string;
  },
) {
  const runBare = bare(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run) {
    return { error: { code: "RUN_NOT_FOUND", message: "Run not found" } } as const;
  }
  if (run.lifecycle === "completed" || run.lifecycle === "failed" || run.lifecycle === "cancelled") {
    return { run: toRunDto(run) } as const;
  }

  const ts = deps.clock.nowIso();
  terminateRunExecutors({
    run_id: input.run_id,
    executorPollStore: deps.executorPollStore,
    reason: input.reason ?? "Run failed",
  });
  await deps.studio.updateRunLifecycle(runBare, "failed", ts);

  const spaceBare = run.space_id;
  const { title, summary } = runFailedNotificationCopy(input.reason);
  if (spaceBare) {
    const session = await deps.studio.getSession(run.session_id);
    const space = await deps.studio.getSpace(spaceBare);
    const grants = await deps.studio.listGrants(spaceBare);

    const recipients = resolveRunFailedNotificationRecipients({
      session_actor_id: session?.actor_id,
      created_by: session?.created_by,
      grants,
    });

    for (const notifyActor of recipients) {
      const draft = buildRunFailedNotificationDraft({
        notification_id: () => deps.ids.ulid(),
        now: ts,
        run_id: prefixedRun(runBare),
        session_id: prefixedSession(run.session_id),
        space_id: addSpaceId(spaceBare),
        space_name: space?.name ?? space?.slug,
        actor_id: notifyActor,
        can_read_space: actorCanReadSpaceForNotification(notifyActor, grants, session?.actor_id),
        title,
        summary: summary ?? space?.name ?? space?.slug,
      });

      if (draft) {
        await deps.studio.insertNotification({
          notification_id: draft.notification_id,
          actor_id: draft.actor_id,
          kind: draft.kind,
          status: draft.status,
          run_id: runBare,
          session_id: run.session_id,
          space_id: spaceBare,
          space_hidden: draft.space_hidden ? 1 : 0,
          title: draft.title,
          summary: draft.summary,
          created_at: draft.created_at,
        });
      }
    }

    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_FAILED,
      space_id: addSpaceId(spaceBare),
      session_id: prefixedSession(run.session_id),
      run_id: prefixedRun(runBare),
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: { reason: input.reason, title, summary },
    });
  }

  await refreshSessionStatus(deps.studio, run.session_id);
  return { run: toRunDto({ ...run, lifecycle: "failed", ended_at: ts }) } as const;
}

export async function createSession(
  deps: SessionRunDeps,
  input: {
    title: string;
    subject?: string;
    actor_id: string;
    token_id: string;
    space_id?: string;
    created_by?: SessionCreatedBy;
  },
) {
  const session_id = deps.ids.ulid();
  const ts = deps.clock.nowIso();
  const created_by: SessionCreatedBy =
    input.created_by ?? { type: "actor", actor_id: input.actor_id };
  const spaces_touched = input.space_id ? [stripSpaceId(input.space_id)] : [];

  await deps.studio.insertSession(
    {
      session_id,
      title: input.title,
      subject: input.subject,
      status: "active",
      created_by,
      spaces_touched,
      actor_id: input.actor_id,
      cancel_requested_at: undefined,
    },
    ts,
  );

  if (input.space_id) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.SESSION_CREATED,
      space_id: input.space_id,
      session_id: `ses_${session_id}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: { title: input.title, subject: input.subject },
    });
  }

  return toSessionDto({
    session_id,
    title: input.title,
    subject: input.subject,
    status: "active",
    created_by,
    spaces_touched,
  });
}

export interface CreateRunInput {
  session_id: string;
  space_id?: string;
  flow_id?: string | null;
  flow_digest?: string;
  input_params?: Record<string, unknown>;
  reference_run_ids?: string[];
  actor_id: string;
  token_id: string;
  capabilities: Capability[];
  contract_ref_id?: string;
  metadata?: Record<string, unknown>;
  from_step_id?: string;
}

export async function createRun(
  deps: SessionRunDeps,
  input: CreateRunInput,
) {
  const sessionBare = bare(input.session_id);
  const session = await deps.studio.getSession(sessionBare);
  if (!session) {
    return { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } } as const;
  }

  if (input.flow_id && !canStartFlow(input.capabilities)) {
    return {
      error: {
        code: "SCOPE_ENFORCEMENT_FAILURE",
        message: "Grant lacks flow:run capability",
      },
    } as const;
  }

  const ts = deps.clock.nowIso();
  let run_id = deps.ids.ulid();
  let instanceBare: string | undefined;

  if (input.contract_ref_id && input.space_id) {
    const result = await deps.handler.execute({
      kind: "instance.create",
      provenance: {
        space_id: input.space_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
      },
      contract_ref_id: input.contract_ref_id,
      metadata: input.metadata,
    } as never);
    if (result.outcome !== "success") {
      return { error: { code: "INSTANCE_CREATE_FAILED", message: "Failed to create aggregate" } } as const;
    }
    instanceBare = bare(String(result.body.instance_id ?? result.body.aggregate_id ?? run_id));
    run_id = instanceBare;
  }

  const spaces_touched = new Set(session.spaces_touched);
  if (input.space_id) spaces_touched.add(stripSpaceId(input.space_id));

  await deps.studio.insertRun(
    {
      run_id,
      session_id: sessionBare,
      space_id: input.space_id ? stripSpaceId(input.space_id) : undefined,
      flow_id: input.flow_id ?? null,
      flow_digest: input.flow_digest,
      lifecycle: "working",
      exec_context: input.input_params ?? {},
      reference_run_ids: (input.reference_run_ids ?? []).map(bare),
      instance_id: instanceBare,
      started_at: ts,
    },
    ts,
  );

  await deps.studio.updateSessionSpacesTouched(sessionBare, [...spaces_touched]);

  if (input.space_id) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_STARTED,
      space_id: input.space_id,
      session_id: `ses_${sessionBare}`,
      run_id: `run_${run_id}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        flow_id: input.flow_id ?? null,
        flow_digest: input.flow_digest,
        reference_run_ids: input.reference_run_ids ?? [],
        from_step_id: input.from_step_id,
      },
    });
  }

  return {
    run: toRunDto({
      run_id,
      session_id: sessionBare,
      space_id: input.space_id ? stripSpaceId(input.space_id) : undefined,
      flow_id: input.flow_id ?? null,
      flow_digest: input.flow_digest,
      lifecycle: "working",
      exec_context: input.input_params ?? {},
      reference_run_ids: (input.reference_run_ids ?? []).map(bare),
      started_at: ts,
    }),
    instance_id: instanceBare ? runIdToInstanceId(`run_${run_id}`) : undefined,
  };
}

/**
 * Capacity admission + run insert inside the per-space guard. Every flow start
 * funnels through here so admission (count + insert) is atomic across start
 * paths and coordinated with apply. A null `flow_id` (headless invoke) skips
 * capacity admission but still holds the guard so apply quiescence is sound.
 */
export async function admitAndCreateRun(
  deps: SessionRunDeps,
  input: CreateRunInput,
) {
  const spaceId = input.space_id;
  const flowId = input.flow_id;
  if (!spaceId) {
    return createRun(deps, input);
  }
  const guard = deps.guard ?? spaceRunGuard;
  return guard.with(spaceId, async () => {
    let flowDigest = input.flow_digest;
    if (flowId) {
      const entry = await deps.studio.getFlowIndexEntry(
        flowId,
        spaceId.startsWith("spc_") ? spaceId.slice(4) : spaceId,
      );
      if (!entry) {
        return {
          error: { code: "FLOW_NOT_FOUND", message: "Flow not indexed in target space" },
        } as const;
      }
      flowDigest = entry.digest;

      const admission = await admitFlowRun(deps.studio, {
        space_id: spaceId,
        flow_id: flowId,
      });
      if (!admission.ok) {
        return { error: admission.error } as const;
      }
    }
    return createRun(deps, { ...input, flow_digest: flowDigest });
  });
}

export async function cancelRun(
  deps: SessionRunDeps,
  input: {
    run_id: string;
    actor_id: string;
    token_id: string;
    space_id?: string;
  },
) {
  const runBare = bare(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run) {
    return { error: { code: "RUN_NOT_FOUND", message: "Run not found" } } as const;
  }
  if (run.lifecycle === "completed" || run.lifecycle === "failed" || run.lifecycle === "cancelled") {
    return { error: { code: "RUN_TERMINAL", message: "Run is already terminal" } } as const;
  }

  const ts = deps.clock.nowIso();
  terminateRunExecutors({
    run_id: prefixedRun(runBare),
    executorPollStore: deps.executorPollStore,
    reason: "cancelled",
  });
  await deps.studio.updateRunLifecycle(runBare, "cancelled", ts);

  const spaceId = input.space_id ?? (run.space_id ? addSpaceId(run.space_id) : undefined);
  if (spaceId) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_FAILED,
      space_id: spaceId,
      session_id: `ses_${run.session_id}`,
      run_id: `run_${runBare}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: { reason: "cancelled" },
    });
  }

  await refreshSessionStatus(deps.studio, run.session_id);
  return { run: toRunDto({ ...run, lifecycle: "cancelled", ended_at: ts }) };
}

export async function cancelSession(
  deps: SessionRunDeps,
  input: {
    session_id: string;
    actor_id: string;
    token_id: string;
    space_id?: string;
  },
) {
  const sessionBare = bare(input.session_id);
  const session = await deps.studio.getSession(sessionBare);
  if (!session) {
    return { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } } as const;
  }

  const ts = deps.clock.nowIso();
  await deps.studio.markSessionCancelRequested(sessionBare, ts);

  const runs = await deps.studio.listRunsBySession(sessionBare);
  const runSpaceId = runs.find((r) => r.space_id)?.space_id;
  const spaceId =
    input.space_id ??
    (session.spaces_touched[0] ? addSpaceId(session.spaces_touched[0]) : undefined) ??
    (runSpaceId ? addSpaceId(runSpaceId) : undefined);

  if (spaceId) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.SESSION_CANCEL_REQUESTED,
      space_id: spaceId,
      session_id: `ses_${sessionBare}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {},
    });
  }
  const timeoutMs = deps.cancelTimeoutMs ?? 30_000;

  for (const run of runs) {
    if (run.lifecycle === "working" || run.lifecycle === "input-required") {
      terminateRunExecutors({
        run_id: prefixedRun(run.run_id),
        executorPollStore: deps.executorPollStore,
        reason: "session cancelled",
      });
      await deps.studio.updateRunLifecycle(run.run_id, "cancelled", ts);
    }
  }

  setTimeout(async () => {
    const pending = await deps.studio.listRunsBySession(sessionBare);
    for (const run of pending) {
      if (run.lifecycle === "working" || run.lifecycle === "input-required") {
        terminateRunExecutors({
          run_id: prefixedRun(run.run_id),
          executorPollStore: deps.executorPollStore,
          reason: "session cancelled",
        });
        await deps.studio.updateRunLifecycle(run.run_id, "cancelled", deps.clock.nowIso());
      }
    }
    await deps.studio.updateSessionStatus(sessionBare, "cancelled");
  }, timeoutMs);

  const status = deriveSessionStatus(
    runs.map((r) =>
      r.lifecycle === "working" || r.lifecycle === "input-required" ? "cancelled" : r.lifecycle,
    ),
    true,
  );
  await deps.studio.updateSessionStatus(sessionBare, status);

  return { session: toSessionDto({ ...session, status }) };
}

export async function retryRun(
  deps: SessionRunDeps,
  input: {
    run_id: string;
    actor_id: string;
    token_id: string;
    space_id?: string;
    from_step_id?: string;
    capabilities: Capability[];
  },
) {
  const runBare = bare(input.run_id);
  const failed = await deps.studio.getRun(runBare);
  if (!failed) {
    return { error: { code: "RUN_NOT_FOUND", message: "Run not found" } } as const;
  }
  if (failed.lifecycle !== "failed" && failed.lifecycle !== "cancelled") {
    return { error: { code: "RUN_NOT_RETRYABLE", message: "Only failed or cancelled runs can be retried" } } as const;
  }

  return admitAndCreateRun(deps, {
    session_id: `ses_${failed.session_id}`,
    space_id: input.space_id ?? (failed.space_id ? addSpaceId(failed.space_id) : undefined),
    flow_id: failed.flow_id,
    flow_digest: failed.flow_digest,
    reference_run_ids: [`run_${runBare}`],
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities,
    from_step_id: input.from_step_id,
  });
}

export async function syncRunLifecycleFromInstance(
  deps: SessionRunDeps,
  instance_id: string,
  state: string,
) {
  const runBare = bare(instance_id);
  const run = await deps.studio.getRun(runBare);
  if (!run) return;
  const lifecycle = instanceStateToLifecycle(state);
  if (run.lifecycle !== lifecycle) {
    const ts = deps.clock.nowIso();
    await deps.studio.updateRunLifecycle(runBare, lifecycle, isRunTerminal(lifecycle) ? ts : undefined);
    await refreshSessionStatus(deps.studio, run.session_id);
  }
}

/** Headless runs (hook/action invoke, no flow graph): close run + session when all steps terminal. */
export async function maybeCompleteHeadlessRun(
  deps: SessionRunDeps,
  input: { run_id: string },
): Promise<void> {
  const runBare = bare(input.run_id);
  const run = await deps.studio.getRun(runBare);
  if (!run || run.flow_id) return;
  if (isRunTerminal(run.lifecycle)) return;

  const memos = await deps.studio.listRunStepMemos(`run_${runBare}`);
  if (memos.length === 0) return;
  if (!memos.every((m) => m.status === "completed" || m.status === "failed")) return;

  const failed = memos.some((m) => m.status === "failed");
  if (failed) {
    const session = await deps.studio.getSession(run.session_id);
    const actor_id = session?.actor_id ?? "system";
    await failRunWithNotification(deps, {
      run_id: prefixedRun(runBare),
      actor_id,
      token_id: "system",
    });
    return;
  }

  const ts = deps.clock.nowIso();
  terminateRunExecutors({
    run_id: prefixedRun(runBare),
    executorPollStore: deps.executorPollStore,
    reason: "run completed",
  });
  await deps.studio.updateRunLifecycle(runBare, "completed", ts);

  const session = await deps.studio.getSession(run.session_id);
  const actor_id = session?.actor_id ?? "system";
  const spaceId = run.space_id ? addSpaceId(run.space_id) : undefined;
  if (spaceId) {
    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.RUN_COMPLETED,
      space_id: spaceId,
      session_id: `ses_${run.session_id}`,
      run_id: `run_${runBare}`,
      actor_id,
      token_id: "system",
      data: {},
    });
  }

  await refreshSessionStatus(deps.studio, run.session_id);
}

const STALE_HEADLESS_DISPATCH_MS = 5 * 60 * 1000;

async function failHeadlessRun(
  deps: SessionRunDeps,
  runBare: string,
  reason: string,
): Promise<void> {
  const run = await deps.studio.getRun(runBare);
  if (!run || isRunTerminal(run.lifecycle)) return;

  const session = await deps.studio.getSession(run.session_id);
  const actor_id = session?.actor_id ?? "system";
  await failRunWithNotification(deps, {
    run_id: prefixedRun(runBare),
    actor_id,
    token_id: "system",
    reason,
  });
}

/** Repair headless runs stuck in working after action completion or abandoned MCP dispatch. */
export async function reconcileHeadlessRuns(deps: SessionRunDeps): Promise<{
  completed: number;
  failed: number;
  stale_failed: number;
}> {
  const runs = await deps.studio.listRuns({
    lifecycles: ["working", "input-required"],
    limit: 500,
  });

  let completed = 0;
  let failed = 0;
  let stale_failed = 0;
  const now = Date.parse(deps.clock.nowIso());

  for (const run of runs) {
    if (run.flow_id) continue;

    const memos = await deps.studio.listRunStepMemos(`run_${run.run_id}`);
    if (memos.length === 0) continue;

    const allTerminal = memos.every((m) => m.status === "completed" || m.status === "failed");
    if (allTerminal) {
      const before = run.lifecycle;
      await maybeCompleteHeadlessRun(deps, { run_id: `run_${run.run_id}` });
      const after = (await deps.studio.getRun(run.run_id))?.lifecycle;
      if (before !== after && after === "completed") completed += 1;
      if (before !== after && after === "failed") failed += 1;
      continue;
    }

    const stillWorking = memos.some((m) => m.status === "working");
    if (!stillWorking) continue;

    const ageMs = now - Date.parse(run.started_at);
    if (ageMs < STALE_HEADLESS_DISPATCH_MS) continue;

    await failHeadlessRun(deps, run.run_id, "stale_headless_dispatch");
    stale_failed += 1;
  }

  return { completed, failed, stale_failed };
}

function isRunTerminal(lifecycle: RunLifecycle): boolean {
  return lifecycle === "completed" || lifecycle === "failed" || lifecycle === "cancelled";
}

export async function ensureSessionAndRun(
  deps: SessionRunDeps,
  input: {
    session_id?: string;
    run_id?: string;
    space_id: string;
    actor_id: string;
    token_id: string;
    title?: string;
    action_name?: string;
  },
) {
  let sessionId = input.session_id;
  let runId = input.run_id;

  if (!sessionId) {
    const session = await createSession(deps, {
      title: input.title ?? `Invoke ${input.action_name ?? "action"}`,
      actor_id: input.actor_id,
      token_id: input.token_id,
      space_id: input.space_id,
    });
    sessionId = session.session_id;
  }

  if (!runId) {
    const created = await admitAndCreateRun(deps, {
      session_id: sessionId,
      space_id: input.space_id,
      flow_id: null,
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: ["action:invoke"],
    });
    if ("error" in created) {
      return { error: created.error };
    }
    runId = created.run.run_id;
  }

  return { session_id: sessionId, run_id: runId };
}
