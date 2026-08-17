import type {
  LiveAssignmentPort,
  LiveAssignmentPrincipal,
  LiveAssignmentRecord,
} from "@murrmure/hub-core";
import type { ControlPrincipal } from "./control-bus.js";
import type { MeetingNotifier } from "./meeting-notifier.js";

export type LiveSeat = LiveAssignmentRecord & {
  session_id: string;
  participant_id: string;
  space_id?: string;
  notified_message_ids?: Set<string>;
};

function prefixedSessionId(session_id: string): string {
  return session_id.startsWith("ses_") ? session_id : `ses_${session_id}`;
}

function seatKey(session_id: string, participant_id: string): string {
  return `${prefixedSessionId(session_id)}:${participant_id}`;
}

export class InMemoryLiveAssignments implements LiveAssignmentPort {
  private readonly seats = new Map<string, LiveSeat>();

  constructor(private readonly notifier: MeetingNotifier) {}

  getSeat(session_id: string, participant_id: string): LiveSeat | undefined {
    return this.seats.get(seatKey(session_id, participant_id));
  }

  async findLive(input: {
    session_id: string;
    participant?: string;
  }): Promise<LiveAssignmentRecord | null> {
    if (input.participant == null || input.participant === "") return null;
    const seat = this.seats.get(seatKey(input.session_id, input.participant));
    if (!seat) return null;
    return {
      run_id: seat.run_id,
      handler_id: seat.handler_id,
      last_delivery_meeting_seq: seat.last_delivery_meeting_seq,
      principal: seat.principal,
    };
  }

  async start(input: {
    session_id: string;
    participant_id: string;
    handler_id: string;
    run_id: string;
    principal?: LiveAssignmentPrincipal;
    space_id?: string;
  }): Promise<void> {
    const session_id = prefixedSessionId(input.session_id);
    const existing = this.seats.get(seatKey(session_id, input.participant_id));
    this.seats.set(seatKey(session_id, input.participant_id), {
      session_id,
      participant_id: input.participant_id,
      run_id: input.run_id,
      handler_id: input.handler_id,
      principal: input.principal ?? existing?.principal,
      space_id: input.space_id ?? existing?.space_id ?? input.principal?.space_id,
      last_delivery_meeting_seq: existing?.last_delivery_meeting_seq,
      notified_message_ids: existing?.notified_message_ids ?? new Set(),
    });
  }

  async notify(input: {
    session_id: string;
    participant_id: string;
    message_id: string;
    since_seq: number;
    handler_id: string;
  }): Promise<void> {
    const session_id = prefixedSessionId(input.session_id);
    const seat = this.seats.get(seatKey(session_id, input.participant_id));
    if (seat?.notified_message_ids?.has(input.message_id)) return;
    await this.notifier.notifyLiveSeat({
      ...input,
      session_id,
      principal: seat?.principal,
      space_id: seat?.space_id,
    });
    if (seat) {
      seat.last_delivery_meeting_seq = input.since_seq;
      seat.notified_message_ids ??= new Set();
      seat.notified_message_ids.add(input.message_id);
    }
  }

  async revoke(input: { session_id: string; participant_id?: string }): Promise<void> {
    const session_id = prefixedSessionId(input.session_id);
    if (input.participant_id) {
      this.seats.delete(seatKey(session_id, input.participant_id));
      return;
    }
    const prefix = `${session_id}:`;
    for (const key of [...this.seats.keys()]) {
      if (key.startsWith(prefix)) this.seats.delete(key);
    }
  }

  bindPrincipal(
    session_id: string,
    participant_id: string,
    principal: ControlPrincipal,
  ): void {
    const seat = this.seats.get(seatKey(session_id, participant_id));
    if (!seat) return;
    seat.principal = principal;
    seat.space_id = principal.space_id;
  }
}
