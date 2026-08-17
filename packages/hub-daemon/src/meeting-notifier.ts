import type { LiveAssignmentPrincipal } from "@murrmure/hub-core";
import type { ControlPrincipal } from "./control-bus.js";
import type { McpSessionRegistry } from "./mcp-session-registry.js";
import { formatMeetingSaidWake } from "./wake-prompt.js";

export type MeetingSaidMessage = {
  method: "murrmure/control.meeting_said";
  params: {
    session_id: string;
    participant_id: string;
    message_id: string;
    since_seq: number;
    handler_id: string;
    prompt?: string;
  };
};

export type MeetingNotifierDeps = {
  publishToPrincipal: (principal: ControlPrincipal, message: MeetingSaidMessage) => void;
  mcpSessionRegistry: McpSessionRegistry;
};

export class MeetingNotifier {
  constructor(private readonly deps: MeetingNotifierDeps) {}

  async notifyLiveSeat(input: {
    session_id: string;
    participant_id: string;
    message_id: string;
    since_seq: number;
    handler_id: string;
    principal?: LiveAssignmentPrincipal;
    space_id?: string;
  }): Promise<void> {
    const principal = this.resolvePrincipal(input);
    if (!principal) return;
    const prompt = formatMeetingSaidWake({
      session_id: input.session_id,
      participant_id: input.participant_id,
      message_id: input.message_id,
      since_seq: input.since_seq,
      handler_id: input.handler_id,
    });
    this.deps.publishToPrincipal(principal, {
      method: "murrmure/control.meeting_said",
      params: {
        session_id: input.session_id,
        participant_id: input.participant_id,
        message_id: input.message_id,
        since_seq: input.since_seq,
        handler_id: input.handler_id,
        prompt,
      },
    });
  }

  private resolvePrincipal(input: {
    principal?: LiveAssignmentPrincipal;
    space_id?: string;
    handler_id: string;
  }): ControlPrincipal | undefined {
    if (input.principal) return input.principal;
    if (!input.space_id) return undefined;
    const connected = this.deps.mcpSessionRegistry.connectedPrincipals(input.space_id);
    if (connected.length === 1) return connected[0];
    return undefined;
  }
}
