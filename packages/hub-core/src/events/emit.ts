import { MURRMURE_DENIAL_CODES, type Capability } from "@murrmure/contracts";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { hasCapability } from "../grants/migrate.js";
import {
  dispatchHooksForEvent,
  type HookDispatchDeps,
  type HookDispatchResult,
} from "../hooks/dispatch.js";
import { resolveHookParticipant, type HookSourceEvent } from "../hooks/matcher.js";

export const HUB_ONLY_EMIT_DENYLIST = [
  "mrmr.meeting.convened",
  "mrmr.meeting.delivered",
  "mrmr.meeting.delivery_failed",
] as const;

export type EmitAndDeliverInput = {
  space_id: string;
  event_type: string;
  event_id?: string;
  payload?: Record<string, unknown>;
  session_id?: string;
  actor_id: string;
  token_id: string;
  capabilities?: Capability[];
};

export type EmitAndDeliverResult =
  | {
      ok: true;
      event_id: string;
      type: string;
      seq: number;
      hook_results: HookDispatchResult[];
    }
  | { ok: false; code: string; message: string; http: 400 | 403 };

function hubStampFrom(
  space_id: string,
  actor_id: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const { from: _ignored, ...rest } = payload;
  return {
    ...rest,
    from: {
      space_id: addSpaceId(stripSpaceId(space_id)),
      actor_id,
    },
  };
}

export async function emitAndDeliver(
  deps: HookDispatchDeps,
  input: EmitAndDeliverInput,
): Promise<EmitAndDeliverResult> {
  const eventType = input.event_type;
  if (HUB_ONLY_EMIT_DENYLIST.includes(eventType as (typeof HUB_ONLY_EMIT_DENYLIST)[number])) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.HUB_ONLY_EVENT,
      message: `${eventType} is hub-authored and cannot be emitted`,
      http: 403,
    };
  }

  const sessionId = input.session_id?.trim() ? input.session_id : undefined;
  if (eventType.startsWith("mrmr.meeting.") && !sessionId) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED,
      message: "Meeting events require a top-level session_id",
      http: 400,
    };
  }

  if (input.capabilities && !hasCapability(input.capabilities, "event:emit")) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE,
      message: "Missing required capability: event:emit",
      http: 403,
    };
  }

  const spaceId = addSpaceId(stripSpaceId(input.space_id));
  const rawPayload = input.payload ?? {};
  const payload = hubStampFrom(spaceId, input.actor_id, rawPayload);
  const event_id = input.event_id ?? `evt_${deps.ids.ulid()}`;

  const journaled = await deps.handler.appendSpaceJournal({
    type: eventType,
    space_id: spaceId,
    session_id: sessionId,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data: payload,
  });

  const event: HookSourceEvent = {
    event_id,
    event_type: eventType,
    space_id: spaceId,
    source: typeof payload.source === "string" ? payload.source : `/spaces/${spaceId}`,
    payload,
    session_id: sessionId,
    participant: resolveHookParticipant({ payload }),
  };

  let hook_results: HookDispatchResult[] = [];
  try {
    hook_results = await dispatchHooksForEvent(deps, event, {
      actor_id: input.actor_id,
      token_id: input.token_id,
      capabilities: input.capabilities ?? ["flow:run", "hub:admin"],
    });
  } catch {
    hook_results = [];
  }

  return {
    ok: true,
    event_id,
    type: eventType,
    seq: journaled.seq,
    hook_results,
  };
}
