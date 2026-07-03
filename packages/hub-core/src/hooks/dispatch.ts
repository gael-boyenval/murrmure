import type { Capability, HookSpec } from "@murrmure/contracts";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { HubHandler } from "../handlers/hub.js";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { createRun, createSession, type SessionRunDeps } from "../run/service.js";
import { startFlowRun, type FlowRunServiceDeps } from "../flow-engine/run-service.js";
import { resolveTemplateString, resolveStepParams } from "../flow-engine/templates.js";
import type { HookSourceEvent } from "./matcher.js";
import { computeHookDedupKey, hookStepId, matchHooks } from "./matcher.js";

export interface HookDispatchDeps extends SessionRunDeps, FlowRunServiceDeps {
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
  }) => Promise<{ http: number }>;
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
      ...event.payload,
    },
  };
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
          const created = await createRun(deps, {
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
          return { outcome: "failed", message: started.error.message };
        }
        sessionId = started.session.session_id;
        runId = started.run_id;
      }
    }

    if (!sessionId || !runId) {
      const created = await createRun(deps, {
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
