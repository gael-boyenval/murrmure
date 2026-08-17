import {
  HandlerSpecSchema,
  MURRMURE_DENIAL_CODES,
  type Capability,
  type HandlerSpec,
  type HookSpec,
} from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES, FLOW_CONCURRENCY_LIMIT } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { admitAndCreateRun, createSession, type SessionRunDeps } from "../run/service.js";
import { startFlowRun, type FlowRunServiceDeps } from "../flow-engine/run-service.js";
import type { FlowAdvanceDeps } from "../flow-engine/advance-runner.js";
import { resolveTemplateString, resolveStepParams } from "../flow-engine/templates.js";
import type { HookSourceEvent } from "./matcher.js";
import { computeHookDedupKey, hookStepId, matchHooks, resolveHookParticipant } from "./matcher.js";
import { matchEventHandlers } from "../index/parse-handlers.js";
import { buildMeetingWakeData, meetingWakeExecContext } from "../meetings/assignment-prompt.js";

export type EventDeliveryMode = "create" | "attach" | "notify_live";

export type LiveAssignmentPrincipal = {
  space_id: string;
  token_id: string;
  client_id: string;
};

export type LiveAssignmentRecord = {
  run_id?: string;
  handler_id?: string;
  last_delivery_meeting_seq?: number;
  principal?: LiveAssignmentPrincipal;
};

export type LiveAssignmentPort = {
  findLive(input: {
    session_id: string;
    participant?: string;
  }): Promise<LiveAssignmentRecord | null>;
  start(input: {
    session_id: string;
    participant_id: string;
    handler_id: string;
    run_id: string;
    principal?: LiveAssignmentPrincipal;
    space_id?: string;
  }): Promise<void>;
  notify(input: {
    session_id: string;
    participant_id: string;
    message_id: string;
    since_seq: number;
    handler_id: string;
  }): Promise<void>;
  revoke(input: { session_id: string; participant_id?: string }): Promise<void>;
};

export type EventDeliveryTarget =
  | { mode: EventDeliveryMode; session_id: string; run_id?: string }
  | { denial: { code: string; message: string } };

export interface HookDispatchDeps extends SessionRunDeps, FlowRunServiceDeps {
  /** Slice 5 join-once. Leave undefined so notify_live is never selected. */
  liveAssignments?: LiveAssignmentPort;
  /** Close of a bound meeting step opens the next flow step. */
  dispatchSteps?: FlowAdvanceDeps["dispatchSteps"];
  invokeAction: (input: {
    space_id: string;
    action_name: string;
    session_id: string;
    run_id: string;
    step_id: string;
    params?: Record<string, unknown>;
    actor_id: string;
    token_id: string;
    idempotency_key?: string;
  }) => Promise<{ http: number; principal?: LiveAssignmentPrincipal }>;
}

export type HookDispatchResult =
  | { outcome: "delivered"; session_id: string; run_id: string }
  | { outcome: "deduped"; run_id: string }
  | { outcome: "failed"; message: string };

function eventExecContext(event: HookSourceEvent): Record<string, unknown> {
  return {
    event: {
      id: event.event_id,
      type: event.event_type,
      source: event.source ?? `/spaces/${event.space_id}`,
      data: event.payload,
    },
  };
}

function prefixedSessionId(session_id: string): string {
  return session_id.startsWith("ses_") ? session_id : `ses_${session_id}`;
}

/** Live-map key: persona used by match (`designer`), not `ptc_*`. */
export function liveSeatParticipantId(event: HookSourceEvent): string {
  return resolveHookParticipant(event) ?? event.participant_id ?? "";
}

export async function resolveEventDeliveryTarget(
  deps: { studio: StudioPersistencePort; liveAssignments?: LiveAssignmentPort },
  event: HookSourceEvent,
): Promise<EventDeliveryTarget> {
  const meeting = event.event_type.startsWith("mrmr.meeting.");
  const sessionId = event.session_id?.trim() ? event.session_id : undefined;

  if (!sessionId) {
    if (meeting) {
      return {
        denial: {
          code: MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED,
          message: "Meeting events require a top-level session_id",
        },
      };
    }
    return { mode: "create", session_id: "" };
  }

  const session = await deps.studio.getSession(sessionId);
  if (!session) {
    return {
      denial: {
        code: MURRMURE_DENIAL_CODES.SESSION_NOT_FOUND,
        message: meeting
          ? "Meeting session_id does not match an existing session"
          : "Session not found",
      },
    };
  }

  const existingId = prefixedSessionId(session.session_id);
  if (deps.liveAssignments) {
    const live = await deps.liveAssignments.findLive({
      session_id: existingId,
      participant: resolveHookParticipant(event),
    });
    if (live) {
      return { mode: "notify_live", session_id: existingId, run_id: live.run_id };
    }
  }

  return { mode: "attach", session_id: existingId };
}

function resolveHookParams(
  params: Record<string, unknown> | undefined,
  execContext: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      out[key] = resolveTemplateString(value, execContext);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function dispatchHook(
  deps: HookDispatchDeps,
  input: {
    hook_space_id: string;
    hook_id: string;
    spec: HookSpec;
    event: HookSourceEvent;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<HookDispatchResult> {
  const source = input.event.source ?? `/spaces/${input.event.space_id}`;
  const dedupKey = computeHookDedupKey(source, input.event.event_id, input.hook_id);

  const existing = await deps.studio.findRunByIdempotencyKey(dedupKey);
  if (existing) {
    return { outcome: "deduped", run_id: `run_${existing.run_id}` };
  }

  const execContext = eventExecContext(input.event);
  const hookSpace = addSpaceId(stripSpaceId(input.hook_space_id));
  let sessionId: string | undefined;
  let runId: string | undefined;

  try {
    for (const action of input.spec.do) {
      if ("ensure_session" in action) {
        const session = await createSession(deps, {
          title: resolveTemplateString(action.ensure_session.title, execContext),
          subject: action.ensure_session.subject
            ? resolveTemplateString(action.ensure_session.subject, execContext)
            : input.hook_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          space_id: hookSpace,
          created_by: { type: "hook", hook_id: input.hook_id },
        });
        sessionId = session.session_id;
        continue;
      }

      if (!sessionId) {
        const session = await createSession(deps, {
          title: `Hook ${input.hook_id}`,
          subject: input.hook_id,
          actor_id: input.actor_id,
          token_id: input.token_id,
          space_id: hookSpace,
          created_by: { type: "hook", hook_id: input.hook_id },
        });
        sessionId = session.session_id;
      }

      if ("invoke" in action) {
        if (!runId) {
          const created = await admitAndCreateRun(deps, {
            session_id: sessionId,
            space_id: hookSpace,
            flow_id: null,
            input_params: { ...execContext, idempotency_key: dedupKey },
            actor_id: input.actor_id,
            token_id: input.token_id,
            capabilities: input.capabilities,
          });
          if ("error" in created) {
            return { outcome: "failed", message: created.error?.message ?? "create_run_failed" };
          }
          runId = created.run.run_id;
        }

        const targetSpace = action.invoke.space
          ? addSpaceId(stripSpaceId(resolveTemplateString(action.invoke.space, execContext)))
          : hookSpace;
        const params = resolveHookParams(action.invoke.params, execContext);
        const step_id = hookStepId(input.hook_id);
        const invokeResult = await deps.invokeAction({
          space_id: targetSpace,
          action_name: action.invoke.action,
          session_id: sessionId,
          run_id: runId,
          step_id,
          params,
          actor_id: input.actor_id,
          token_id: input.token_id,
          idempotency_key: `${runId}:${step_id}:${dedupKey}`,
        });
        if (invokeResult.http >= 400) {
          return { outcome: "failed", message: "invoke_failed" };
        }
        continue;
      }

      if ("start_flow" in action) {
        const flowInput = resolveStepParams(action.start_flow.input, execContext) ?? {};
        const entry = await deps.studio.getFlowIndexEntry(
          action.start_flow.flow_id,
          stripSpaceId(hookSpace),
        );
        if (!entry) {
          return { outcome: "failed", message: "flow_not_found" };
        }
        const started = await startFlowRun(deps, {
          entry,
          space_id: hookSpace,
          session_id: sessionId,
          actor_id: input.actor_id,
          token_id: input.token_id,
          capabilities: input.capabilities,
          input: flowInput,
          idempotency_header: dedupKey,
          mode: "event",
          event_type: input.event.event_type,
          event_source: source,
        });
        if (!started.ok) {
          if (started.error.code === FLOW_CONCURRENCY_LIMIT) {
            await deps.handler
              .appendSpaceJournal({
                type: JOURNAL_EVENT_TYPES.FLOW_START_DENIED,
                space_id: hookSpace,
                actor_id: input.actor_id,
                token_id: input.token_id,
                data: {
                  flow_id: entry.flow_id,
                  flow_name: entry.name,
                  mode: "event",
                  event_type: input.event.event_type,
                  event_source: source,
                  max_concurrent_runs: started.error.max_concurrent_runs,
                  active_run_ids: started.error.active_run_ids,
                },
              })
              .catch(() => undefined);
          }
          return { outcome: "failed", message: started.error.message };
        }
        sessionId = started.session.session_id;
        runId = started.run_id;
      }
    }

    if (!sessionId || !runId) {
      const created = await admitAndCreateRun(deps, {
        session_id: sessionId!,
        space_id: hookSpace,
        flow_id: null,
        input_params: { ...execContext, idempotency_key: dedupKey },
        actor_id: input.actor_id,
        token_id: input.token_id,
        capabilities: input.capabilities,
      });
      if ("error" in created) {
        return { outcome: "failed", message: created.error?.message ?? "create_run_failed" };
      }
      runId = created.run.run_id;
    }

    await deps.handler.appendSpaceJournal({
      type: JOURNAL_EVENT_TYPES.HOOK_DELIVERED,
      space_id: hookSpace,
      session_id: sessionId,
      run_id: runId,
      actor_id: input.actor_id,
      token_id: input.token_id,
      data: {
        hook_id: input.hook_id,
        event_id: input.event.event_id,
        event_type: input.event.event_type,
        dedup_key: dedupKey,
      },
    });

    if (!sessionId || !runId) {
      return { outcome: "failed", message: "hook_incomplete" };
    }
    return { outcome: "delivered", session_id: sessionId, run_id: runId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "hook_delivery_failed";
    return { outcome: "failed", message };
  }
}

async function deliverToAssignment(
  deps: HookDispatchDeps,
  input: {
    hook_space_id: string;
    handler: HandlerSpec;
    event: HookSourceEvent;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
    target: { mode: EventDeliveryMode; session_id: string; run_id?: string };
    dedupKey: string;
  },
): Promise<HookDispatchResult> {
  if (input.target.mode === "notify_live") {
    return deliverLiveNotify(deps, input);
  }

  const meetingWake = await buildMeetingWakeData(deps.studio, input.event);
  const execContext = meetingWake ? meetingWakeExecContext(meetingWake) : eventExecContext(input.event);
  const hookSpace = addSpaceId(stripSpaceId(input.hook_space_id));
  let sessionId = input.target.session_id;

  if (input.target.mode === "create") {
    const session = await createSession(deps, {
      title: `Handler ${input.handler.id}`,
      subject: input.handler.id,
      actor_id: input.actor_id,
      token_id: input.token_id,
      space_id: hookSpace,
      created_by: { type: "hook", hook_id: input.handler.id },
    });
    sessionId = session.session_id;
  }

  const created = await admitAndCreateRun(deps, {
    session_id: sessionId,
    space_id: hookSpace,
    flow_id: null,
    input_params: { ...execContext, idempotency_key: input.dedupKey },
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities,
  });
  if ("error" in created) {
    return { outcome: "failed", message: created.error?.message ?? "create_run_failed" };
  }

  const resolvedParams = resolveHookParams(
    input.handler.type === "view_resolver" ? undefined : input.handler.params,
    execContext,
  );
  const params = meetingWake ? { ...resolvedParams, ...meetingWake } : resolvedParams;
  const step_id = hookStepId(input.handler.id);
  const invokeResult = await deps.invokeAction({
    space_id: hookSpace,
    action_name: input.handler.id,
    session_id: sessionId,
    run_id: created.run.run_id,
    step_id,
    params,
    actor_id: input.actor_id,
    token_id: input.token_id,
    idempotency_key: `${created.run.run_id}:${step_id}:${input.dedupKey}`,
  });
  if (invokeResult.http >= 400) {
    return { outcome: "failed", message: "invoke_failed" };
  }

  if (
    input.target.mode === "attach" &&
    input.event.event_type === JOURNAL_EVENT_TYPES.MEETING_SAID &&
    deps.liveAssignments
  ) {
    await deps.liveAssignments.start({
      session_id: sessionId,
      participant_id: liveSeatParticipantId(input.event),
      handler_id: input.handler.id,
      run_id: created.run.run_id,
      principal: invokeResult.principal,
      space_id: hookSpace,
    });
  }

  await deps.handler.appendSpaceJournal({
    type: JOURNAL_EVENT_TYPES.HOOK_DELIVERED,
    space_id: hookSpace,
    session_id: sessionId,
    run_id: created.run.run_id,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: {
      hook_id: input.handler.id,
      event_id: input.event.event_id,
      event_type: input.event.event_type,
      dedup_key: input.dedupKey,
    },
  });

  return { outcome: "delivered", session_id: sessionId, run_id: created.run.run_id };
}

async function deliverLiveNotify(
  deps: HookDispatchDeps,
  input: {
    hook_space_id: string;
    handler: HandlerSpec;
    event: HookSourceEvent;
    actor_id: string;
    token_id: string;
    target: { mode: EventDeliveryMode; session_id: string; run_id?: string };
    dedupKey: string;
  },
): Promise<HookDispatchResult> {
  if (!deps.liveAssignments) {
    return { outcome: "failed", message: "notify_live_not_implemented" };
  }

  const meetingWake = await buildMeetingWakeData(deps.studio, input.event);
  const participant_id = liveSeatParticipantId(input.event);
  const message_id =
    meetingWake?.message_id ??
    (typeof input.event.payload.message_id === "string" ? input.event.payload.message_id : "");
  const since_seq = meetingWake?.since_seq ?? 0;

  try {
    await deps.liveAssignments.notify({
      session_id: input.target.session_id,
      participant_id,
      message_id,
      since_seq,
      handler_id: input.handler.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "notify_failed";
    return { outcome: "failed", message };
  }

  const hookSpace = addSpaceId(stripSpaceId(input.hook_space_id));
  const runId = input.target.run_id ?? "run_live";
  await deps.handler.appendSpaceJournal({
    type: JOURNAL_EVENT_TYPES.HOOK_DELIVERED,
    space_id: hookSpace,
    session_id: input.target.session_id,
    run_id: runId,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: {
      hook_id: input.handler.id,
      event_id: input.event.event_id,
      event_type: input.event.event_type,
      dedup_key: input.dedupKey,
    },
  });

  return { outcome: "delivered", session_id: input.target.session_id, run_id: runId };
}

export async function dispatchMatchedEventHandler(
  deps: HookDispatchDeps,
  input: {
    hook_space_id: string;
    handler: HandlerSpec;
    event: HookSourceEvent;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<HookDispatchResult> {
  const source = input.event.source ?? `/spaces/${input.event.space_id}`;
  const dedupKey = computeHookDedupKey(source, input.event.event_id, input.handler.id);
  const existing = await deps.studio.findRunByIdempotencyKey(dedupKey);
  if (existing) {
    return { outcome: "deduped", run_id: `run_${existing.run_id}` };
  }

  const target = await resolveEventDeliveryTarget(deps, input.event);
  if ("denial" in target) {
    return { outcome: "failed", message: target.denial.message };
  }

  return deliverToAssignment(deps, { ...input, target, dedupKey });
}

export async function dispatchHooksForEvent(
  deps: HookDispatchDeps,
  event: HookSourceEvent,
  input: { actor_id: string; token_id: string; capabilities: Capability[] },
): Promise<HookDispatchResult[]> {
  const spaces = await deps.studio.listSpaces();
  const results: HookDispatchResult[] = [];

  for (const space of spaces) {
    const rawHooks = await deps.studio.listIndexedHooks(space.space_id);
    for (const raw of rawHooks) {
      const parsedHandler = HandlerSpecSchema.safeParse(raw);
      if (parsedHandler.success) {
        const eventSource = event.source ?? `/spaces/${event.space_id}`;
        const matchedHandlers = matchEventHandlers([parsedHandler.data], {
          event_type: event.event_type,
          source: eventSource,
          participant: resolveHookParticipant(event),
        });
        for (const matchedHandler of matchedHandlers) {
          const result = await dispatchMatchedEventHandler(deps, {
            hook_space_id: space.space_id,
            handler: matchedHandler,
            event,
            actor_id: input.actor_id,
            token_id: input.token_id,
            capabilities: input.capabilities,
          });
          results.push(result);
        }
        continue;
      }

      const hook_id = String(raw.name ?? "");
      const spec = raw as HookSpec & { name?: string };
      if (!spec.on || !spec.do) continue;

      const matched = matchHooks([{ name: hook_id, ...spec }], event);
      for (const hook of matched) {
        const result = await dispatchHook(deps, {
          hook_space_id: space.space_id,
          hook_id: hook.hook_id,
          spec: hook.spec,
          event,
          actor_id: input.actor_id,
          token_id: input.token_id,
          capabilities: input.capabilities,
        });
        results.push(result);
      }
    }
  }

  return results;
}
