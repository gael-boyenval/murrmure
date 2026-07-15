import type { DaemonContext } from "./context.js";
import {
  dispatchHooksForEvent,
  type HookDispatchDeps,
  type HookSourceEvent,
} from "@murrmure/hub-core";
import { ulid } from "ulid";
import type { Capability } from "@murrmure/contracts";
import { prefixedSpaceId } from "./space-id.js";

function hookDispatchDeps(ctx: DaemonContext): HookDispatchDeps {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
    cancelTimeoutMs: ctx.config.cancelTimeoutMs,
    guard: ctx.spaceRunGuard,
    invokeAction: async (input) => {
      const result = await ctx.invokeService.invokeAction({
        space_id: input.space_id,
        action_name: input.action_name,
        body: {
          session_id: input.session_id,
          run_id: input.run_id,
          step_id: input.step_id,
          params: input.params,
        },
        actor_id: input.actor_id,
        token_id: input.token_id,
        idempotency_header: input.idempotency_key,
      });
      return { http: result.http };
    },
  };
}

export async function dispatchHooksFromJournal(
  ctx: DaemonContext,
  event: HookSourceEvent,
  input: { actor_id: string; token_id: string; capabilities?: Capability[] },
): Promise<void> {
  await dispatchHooksForEvent(hookDispatchDeps(ctx), event, {
    actor_id: input.actor_id,
    token_id: input.token_id,
    capabilities: input.capabilities ?? ["flow:run", "hub:admin"],
  });
}

export function journalEventToHookSource(input: {
  event_id: string;
  event_type: string;
  space_id: string;
  payload: Record<string, unknown>;
}): HookSourceEvent {
  const spaceId = prefixedSpaceId(input.space_id.replace(/^spc_/, ""));
  const defaultSource = `/spaces/${spaceId}`;
  return {
    event_id: input.event_id,
    event_type: input.event_type,
    space_id: spaceId,
    source: typeof input.payload.source === "string" ? input.payload.source : defaultSource,
    payload: input.payload,
  };
}
