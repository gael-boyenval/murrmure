import { ulid } from "ulid";
import {
  dueScheduledFlows,
  startFlowRun,
  matchesFlowStartEvent,
  type FlowRunServiceDeps,
} from "@murrmure/hub-core";
import { FLOW_CONCURRENCY_LIMIT, JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { InvokeService } from "./invoke-service.js";
import { dispatchFlowSteps } from "./flow-dispatch.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

export function registerFlowSchedulerCron(
  studio: StudioPersistencePort,
  invokeService: InvokeService,
  deps: () => FlowRunServiceDeps,
  actor: { actor_id: string; token_id: string },
): () => void {
  const fired = new Set<string>();

  const tick = async () => {
    const now = new Date();
    const minuteKey = `${now.toISOString().slice(0, 16)}`;
    const spaces = await studio.listSpaces();

    for (const space of spaces) {
      const flows = await studio.listFlowIndex(space.space_id);
      const due = dueScheduledFlows(
        flows.map((f) => ({ flow_id: f.flow_id, schedule: f.triggers.schedule })),
        now,
      );

      for (const flow_id of due) {
        const dedupeKey = `${space.space_id}:${flow_id}:${minuteKey}`;
        if (fired.has(dedupeKey)) continue;
        fired.add(dedupeKey);

        const entry = flows.find((f) => f.flow_id === flow_id);
        if (!entry) continue;

        const result = await startFlowRun(deps(), {
          entry,
          space_id: prefixedSpaceId(space.space_id),
          actor_id: actor.actor_id,
          token_id: actor.token_id,
          capabilities: ["flow:run", "action:invoke", "hub:admin"],
          mode: "schedule",
          input: { scheduled_at: now.toISOString() },
        });

        if (result.ok && !result.deduplicated && result.dispatch.length) {
          await dispatchFlowSteps(invokeService, {
            dispatch: result.dispatch,
            session_id: result.session.session_id,
            run_id: result.run_id,
            actor_id: actor.actor_id,
            token_id: actor.token_id,
          });
        }
      }
    }

    if (fired.size > 10_000) fired.clear();
  };

  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export async function matchFlowEventStarts(
  studio: StudioPersistencePort,
  invokeService: InvokeService,
  deps: () => FlowRunServiceDeps,
  input: {
    event_type: string;
    space_id: string;
    source?: string;
    actor_id: string;
    token_id: string;
    capabilities?: import("@murrmure/contracts").Capability[];
  },
): Promise<void> {
  const bare = bareSpaceId(input.space_id);
  const flows = await studio.listFlowIndex(bare);

  for (const entry of flows) {
    if (!matchesFlowStartEvent(entry, { type: input.event_type, source: input.source })) continue;

    const result = await startFlowRun(deps(), {
      entry,
      space_id: prefixedSpaceId(bare),
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? ["flow:run", "action:invoke"],
      mode: "event",
      event_type: input.event_type,
      event_source: input.source,
      input: { event_type: input.event_type, source: input.source },
    });

    if (!result.ok) {
      // Record the typed denial so it is observable; a later retry performs a
      // fresh admission check (capacity may have freed). Overflow creates no run.
      if (result.error.code === FLOW_CONCURRENCY_LIMIT) {
        await deps()
          .handler.appendSpaceJournal({
            type: JOURNAL_EVENT_TYPES.FLOW_START_DENIED,
            space_id: prefixedSpaceId(bare),
            actor_id: input.actor_id,
            token_id: input.token_id,
            data: {
              flow_id: entry.flow_id,
              flow_name: entry.name,
              mode: "event",
              event_type: input.event_type,
              event_source: input.source,
              max_concurrent_runs: result.error.max_concurrent_runs,
              active_run_ids: result.error.active_run_ids,
            },
          })
          .catch(() => undefined);
      }
      continue;
    }

    if (!result.deduplicated && result.dispatch.length) {
      await dispatchFlowSteps(invokeService, {
        dispatch: result.dispatch,
        session_id: result.session.session_id,
        run_id: result.run_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
      });
    }
  }
}

export function flowRunDeps(ctx: {
  murrmurePersistence: StudioPersistencePort;
  handler: import("@murrmure/hub-core").HubHandler;
  config: { cancelTimeoutMs?: number };
  spaceRunGuard?: import("@murrmure/hub-core").SpaceConcurrencyGuard;
}): FlowRunServiceDeps {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
    cancelTimeoutMs: ctx.config.cancelTimeoutMs,
    guard: ctx.spaceRunGuard,
  };
}
