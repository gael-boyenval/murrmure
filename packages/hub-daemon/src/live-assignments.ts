import type {
  LiveAssignmentPort,
  LiveAssignmentPrincipal,
  LiveAssignmentRecord,
} from "@murrmure/hub-core";
import type { ControlPrincipal } from "./control-bus.js";
import type { MeetingNotifier } from "./meeting-notifier.js";
import type { McpSessionRegistry } from "./mcp-session-registry.js";
import { bareSpaceId } from "./space-id.js";

export type LiveSeat = LiveAssignmentRecord & {
  session_id: string;
  participant_id: string;
  space_id?: string;
  started_at?: number;
  notified_message_ids?: Set<string>;
  controller?: PersistentSeatController;
};

export type PersistentSeatController = {
  close(reason?: string): Promise<void>;
  write?(text: string): void;
};

type PendingNotify = {
  session_id: string;
  participant_id: string;
  message_id: string;
  since_seq: number;
  handler_id: string;
  prompt?: string;
};

function prefixedSessionId(session_id: string): string {
  return session_id.startsWith("ses_") ? session_id : `ses_${session_id}`;
}

function seatKey(session_id: string, participant_id: string): string {
  return `${prefixedSessionId(session_id)}:${participant_id}`;
}

function sameSpace(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return bareSpaceId(left) === bareSpaceId(right);
}

export class InMemoryLiveAssignments implements LiveAssignmentPort {
  private readonly seats = new Map<string, LiveSeat>();
  private readonly pending = new Map<string, PendingNotify[]>();

  constructor(
    private readonly notifier: MeetingNotifier,
    registry?: McpSessionRegistry,
  ) {
    registry?.onConnect((principal, meeting) => {
      if (!meeting) return;
      this.bindPrincipal(meeting.session_id, meeting.participant_id, principal);
    });
  }

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
      started_at: existing?.started_at ?? Date.now(),
      last_delivery_meeting_seq: existing?.last_delivery_meeting_seq,
      notified_message_ids: existing?.notified_message_ids ?? new Set(),
      controller: existing?.controller,
    });
  }

  attachController(
    session_id: string,
    participant_id: string,
    controller: PersistentSeatController,
  ): void {
    const seat = this.seats.get(seatKey(session_id, participant_id));
    if (!seat) {
      void controller.close("assignment_not_live");
      return;
    }
    seat.controller = controller;
    void this.flushPending(seat);
  }

  async notify(input: {
    session_id: string;
    participant_id: string;
    message_id: string;
    since_seq: number;
    handler_id: string;
    prompt?: string;
  }): Promise<void> {
    const session_id = prefixedSessionId(input.session_id);
    const key = seatKey(session_id, input.participant_id);
    const seat = this.seats.get(key);
    if (seat?.notified_message_ids?.has(input.message_id)) return;
    if (seat && this.deliverToPty(seat, { ...input, session_id })) return;
    if (seat?.principal) {
      await this.deliver(seat, { ...input, session_id });
      return;
    }
    const queued = this.pending.get(key) ?? [];
    if (queued.some((row) => row.message_id === input.message_id)) return;
    queued.push({ ...input, session_id });
    this.pending.set(key, queued);
  }

  async revoke(input: { session_id: string; participant_id?: string }): Promise<void> {
    const session_id = prefixedSessionId(input.session_id);
    const controllers: Array<{ close(reason?: string): Promise<void> }> = [];
    if (input.participant_id) {
      const key = seatKey(session_id, input.participant_id);
      const seat = this.seats.get(key);
      if (seat?.controller) controllers.push(seat.controller);
      this.seats.delete(key);
      this.pending.delete(key);
    } else {
      const prefix = `${session_id}:`;
      for (const key of [...this.seats.keys()]) {
        if (key.startsWith(prefix)) {
          const seat = this.seats.get(key);
          if (seat?.controller) controllers.push(seat.controller);
          this.seats.delete(key);
          this.pending.delete(key);
        }
      }
    }
    await Promise.allSettled(controllers.map((controller) => controller.close("meeting_closed")));
  }

  bindPrincipal(
    session_id: string,
    participant_id: string,
    principal: ControlPrincipal,
  ): void {
    const seat = this.seats.get(seatKey(session_id, participant_id));
    if (!seat || !sameSpace(seat.space_id, principal.space_id)) return;
    seat.principal = principal;
    seat.space_id = principal.space_id;
    void this.flushPending(seat);
  }

  private async flushPending(seat: LiveSeat): Promise<void> {
    const key = seatKey(seat.session_id, seat.participant_id);
    const queued = this.pending.get(key) ?? [];
    this.pending.delete(key);
    const leftover: PendingNotify[] = [];
    for (const row of queued) {
      if (seat.notified_message_ids?.has(row.message_id)) continue;
      if (this.deliverToPty(seat, row)) continue;
      if (seat.principal) {
        await this.deliver(seat, row);
        continue;
      }
      leftover.push(row);
    }
    if (leftover.length > 0) this.pending.set(key, leftover);
  }

  private deliverToPty(seat: LiveSeat, input: PendingNotify): boolean {
    const write = seat.controller?.write;
    const prompt = input.prompt?.trim();
    if (!write || !prompt) return false;
    write(prompt);
    seat.last_delivery_meeting_seq = input.since_seq;
    seat.notified_message_ids ??= new Set();
    seat.notified_message_ids.add(input.message_id);
    return true;
  }

  private async deliver(seat: LiveSeat, input: PendingNotify): Promise<void> {
    await this.notifier.notifyLiveSeat({
      session_id: input.session_id,
      participant_id: input.participant_id,
      message_id: input.message_id,
      since_seq: input.since_seq,
      handler_id: input.handler_id,
      principal: seat.principal,
      space_id: seat.space_id,
    });
    seat.last_delivery_meeting_seq = input.since_seq;
    seat.notified_message_ids ??= new Set();
    seat.notified_message_ids.add(input.message_id);
  }
}
