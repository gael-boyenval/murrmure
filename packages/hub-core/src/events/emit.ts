import { JOURNAL_EVENT_TYPES, MURRMURE_DENIAL_CODES, type Capability } from "@murrmure/contracts";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { hasCapability } from "../grants/migrate.js";
import {
  dispatchHooksForEvent,
  type HookDispatchDeps,
  type HookDispatchResult,
} from "../hooks/dispatch.js";
import { resolveHookParticipant, type HookSourceEvent } from "../hooks/matcher.js";
import { InlinePayloadExceededError } from "../journal/append.js";
import { appendMeetingEvent } from "../meetings/journal.js";
import { persistClosedSnapshot, prepareMeetingClosed } from "../meetings/close.js";
import { dispatchMeetingSaidTargets } from "../meetings/dispatch.js";
import { maybeResolveBoundMeetingStep } from "../meetings/resolve-bound-step.js";
import { prepareMeetingSaid } from "../meetings/said.js";

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
  | { ok: false; code: string; message: string; http: 400 | 403 | 409 };

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

function isMeetingType(eventType: string): boolean {
  return eventType.startsWith("mrmr.meeting.");
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
  if (isMeetingType(eventType) && !sessionId) {
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
  let payload = hubStampFrom(spaceId, input.actor_id, rawPayload);
  const event_id = input.event_id ?? `evt_${deps.ids.ulid()}`;

  let saidPrepared: Awaited<ReturnType<typeof prepareMeetingSaid>> | undefined;
  if (eventType === JOURNAL_EVENT_TYPES.MEETING_SAID && sessionId) {
    saidPrepared = await prepareMeetingSaid(deps, {
      space_id: spaceId,
      session_id: sessionId,
      payload,
    });
    if (!saidPrepared.ok) return saidPrepared;
    payload = "prepared" in saidPrepared ? saidPrepared.prepared.payload : saidPrepared.payload;
  }

  let closedPrepared: Awaited<ReturnType<typeof prepareMeetingClosed>> | undefined;
  if (eventType === JOURNAL_EVENT_TYPES.MEETING_CLOSED && sessionId) {
    closedPrepared = await prepareMeetingClosed(deps, {
      session_id: sessionId,
      actor_id: input.actor_id,
      space_id: spaceId,
      payload,
    });
    if (!closedPrepared.ok) return closedPrepared;
    payload = closedPrepared.payload;
  }

  const speakerPersona =
    saidPrepared && saidPrepared.ok && "prepared" in saidPrepared
      ? saidPrepared.prepared.speaker.persona
      : resolveHookParticipant({ payload });

  let journaled: { seq: number; entry_id: string };
  try {
    journaled = isMeetingType(eventType) && sessionId
      ? await appendMeetingEvent(deps, {
          space_id: spaceId,
          type: eventType,
          actor_id: input.actor_id,
          token_id: input.token_id,
          session_id: sessionId,
          event_id,
          data: payload,
        })
      : await deps.handler.appendSpaceJournal({
          type: eventType,
          space_id: spaceId,
          session_id: sessionId,
          actor_id: input.actor_id,
          token_id: input.token_id,
          event_id,
          data: payload,
        });
  } catch (error) {
    if (error instanceof InlinePayloadExceededError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        http: 400,
      };
    }
    throw error;
  }

  const event: HookSourceEvent = {
    event_id,
    event_type: eventType,
    space_id: spaceId,
    source: typeof payload.source === "string" ? payload.source : `/spaces/${spaceId}`,
    payload,
    session_id: sessionId,
    participant: speakerPersona,
  };

  let hook_results: HookDispatchResult[] = [];
  try {
    if (saidPrepared && saidPrepared.ok && "prepared" in saidPrepared) {
      await dispatchMeetingSaidTargets(deps, {
        event,
        prepared: saidPrepared.prepared,
        actor_id: input.actor_id,
        token_id: input.token_id,
        capabilities: input.capabilities ?? ["flow:run", "hub:admin"],
      });
    } else if (closedPrepared && closedPrepared.ok) {
      await persistClosedSnapshot(deps, {
        meeting: closedPrepared.meeting,
        entry_id: journaled.entry_id,
        meeting_seq: "meeting_seq" in journaled ? Number(journaled.meeting_seq) : 0,
        failed: payload.failed === true,
      });
      if (sessionId) {
        await deps.liveAssignments?.revoke({
          session_id: sessionId.startsWith("ses_") ? sessionId : `ses_${sessionId}`,
        });
        await maybeResolveBoundMeetingStep(deps, {
          meeting: closedPrepared.meeting,
          failed: payload.failed === true,
          actor_id: input.actor_id,
          token_id: input.token_id,
          space_id: spaceId,
          session_id: sessionId,
        });
      }
    } else {
      hook_results = await dispatchHooksForEvent(deps, event, {
        actor_id: input.actor_id,
        token_id: input.token_id,
        capabilities: input.capabilities ?? ["flow:run", "hub:admin"],
      });
    }
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
