import type { DaemonContext } from "./context.js";
import {
  dispatchHooksForEvent,
  resolveHookParticipant,
  type HookDispatchDeps,
  type HookSourceEvent,
} from "@murrmure/hub-core";
import { ulid } from "ulid";
import type { Capability } from "@murrmure/contracts";
import { dispatchFlowSteps } from "./flow-dispatch.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

export function hookDispatchDeps(ctx: DaemonContext): HookDispatchDeps {
  return {
    studio: ctx.murrmurePersistence,
    handler: ctx.handler,
    ids: { ulid: () => ulid() },
    clock: { nowIso: () => new Date().toISOString() },
    cancelTimeoutMs: ctx.config.cancelTimeoutMs,
    guard: ctx.spaceRunGuard,
    liveAssignments: ctx.liveAssignments,
    dispatchSteps: async (input) => {
      await dispatchFlowSteps(ctx.invokeService, input);
    },
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
      const principals = ctx.mcpSessionRegistry.connectedPrincipals(bareSpaceId(input.space_id));
      const principal = principals.length === 1 ? principals[0] : undefined;
      return { http: result.http, principal };
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
  session_id?: string;
  participant?: string;
}): HookSourceEvent {
  const spaceId = prefixedSpaceId(input.space_id.replace(/^spc_/, ""));
  const defaultSource = `/spaces/${spaceId}`;
  const session_id =
    typeof input.session_id === "string" && input.session_id
      ? input.session_id
      : typeof input.payload.session_id === "string"
        ? input.payload.session_id
        : undefined;
  return {
    event_id: input.event_id,
    event_type: input.event_type,
    space_id: spaceId,
    source: typeof input.payload.source === "string" ? input.payload.source : defaultSource,
    payload: input.payload,
    session_id,
    participant: resolveHookParticipant({
      participant: input.participant,
      payload: input.payload,
    }),
  };
}
