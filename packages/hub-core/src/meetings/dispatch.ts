import { HandlerSpecSchema, JOURNAL_EVENT_TYPES, type Capability } from "@murrmure/contracts";
import type { MeetingRosterSeatRow } from "@murrmure/hub-persistence";
import { stripSpaceId } from "../bridge/ids.js";
import { dispatchMatchedEventHandler, type HookDispatchDeps } from "../hooks/dispatch.js";
import type { HookSourceEvent } from "../hooks/matcher.js";
import { matchEventHandlers } from "../index/parse-handlers.js";
import { appendMeetingDelivered, appendMeetingDeliveryFailed } from "./receipts.js";
import type { PreparedSaid } from "./said.js";

export async function dispatchMeetingSaidTargets(
  deps: HookDispatchDeps,
  input: {
    event: HookSourceEvent;
    prepared: PreparedSaid;
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<void> {
  const { prepared, event } = input;
  for (const target of prepared.targets) {
    const bare = stripSpaceId(target.space_id);
    const rawHooks = await deps.studio.listIndexedHooks(bare);
    const handlers = rawHooks
      .map((raw) => HandlerSpecSchema.safeParse(raw))
      .filter((parsed): parsed is { success: true; data: import("@murrmure/contracts").HandlerSpec } => parsed.success)
      .map((parsed) => parsed.data);
    const targetEvent: HookSourceEvent = {
      ...event,
      participant: target.persona,
      participant_id: target.participant_id,
      space_id: target.space_id,
    };
    const matched = matchEventHandlers(handlers, {
      event_type: JOURNAL_EVENT_TYPES.MEETING_SAID,
      source: event.source ?? `/spaces/${event.space_id}`,
      participant: target.persona,
    });

    if (matched.length === 0) {
      await appendMeetingDeliveryFailed(deps, {
        space_id: target.space_id,
        session_id: event.session_id ?? prepared.meeting.session_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
        message_id: prepared.message_id,
        participant_id: target.participant_id,
        reason: "NO_HANDLER",
      });
      continue;
    }

    let delivered = false;
    let failReason = "EXECUTOR_UNAVAILABLE";
    for (const handler of matched) {
      const result = await dispatchMatchedEventHandler(deps, {
        hook_space_id: target.space_id,
        handler,
        event: targetEvent,
        actor_id: input.actor_id,
        token_id: input.token_id,
        capabilities: input.capabilities,
      });
      if (result.outcome === "delivered" || result.outcome === "deduped") {
        delivered = true;
      } else if (result.outcome === "failed") {
        failReason = result.message === "invoke_failed" ? "EXECUTOR_UNAVAILABLE" : result.message;
      }
    }

    if (delivered) {
      await appendMeetingDelivered(deps, {
        space_id: target.space_id,
        session_id: event.session_id ?? prepared.meeting.session_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
        message_id: prepared.message_id,
        participant_id: target.participant_id,
      });
    } else {
      await appendMeetingDeliveryFailed(deps, {
        space_id: target.space_id,
        session_id: event.session_id ?? prepared.meeting.session_id,
        actor_id: input.actor_id,
        token_id: input.token_id,
        message_id: prepared.message_id,
        participant_id: target.participant_id,
        reason: failReason,
      });
    }
  }
}

export async function dispatchMeetingConveneTargets(
  deps: HookDispatchDeps,
  input: {
    session_id: string;
    event_id: string;
    event_type?: typeof JOURNAL_EVENT_TYPES.MEETING_CONVENED | typeof JOURNAL_EVENT_TYPES.MEETING_RESUMED;
    convenor_space_id: string;
    title: string;
    goal?: string;
    roster: MeetingRosterSeatRow[];
    actor_id: string;
    token_id: string;
    capabilities: Capability[];
  },
): Promise<void> {
  const session_id = input.session_id.startsWith("ses_") ? input.session_id : `ses_${input.session_id}`;
  const source = `/spaces/${input.convenor_space_id}`;
  const event_type = input.event_type ?? JOURNAL_EVENT_TYPES.MEETING_CONVENED;
  for (const target of input.roster) {
    const bare = stripSpaceId(target.space_id);
    const rawHooks = await deps.studio.listIndexedHooks(bare);
    const handlers = rawHooks
      .map((raw) => HandlerSpecSchema.safeParse(raw))
      .filter((parsed): parsed is { success: true; data: import("@murrmure/contracts").HandlerSpec } => parsed.success)
      .map((parsed) => parsed.data);
    const targetEvent: HookSourceEvent = {
      event_id: input.event_id,
      event_type,
      space_id: target.space_id,
      source,
      session_id,
      participant: target.persona,
      participant_id: target.participant_id,
      payload: {
        title: input.title,
        goal: input.goal,
      },
    };
    const matched = matchEventHandlers(handlers, {
      event_type,
      source,
      participant: target.persona,
    });
    if (matched.length === 0) continue;
    for (const handler of matched) {
      await dispatchMatchedEventHandler(deps, {
        hook_space_id: target.space_id,
        handler,
        event: targetEvent,
        actor_id: input.actor_id,
        token_id: input.token_id,
        capabilities: input.capabilities,
      });
    }
  }
}
