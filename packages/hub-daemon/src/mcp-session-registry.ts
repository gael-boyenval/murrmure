import type { ControlBus, ControlPrincipal } from "./control-bus.js";
import { bareSpaceId } from "./space-id.js";

export type McpMeetingAssignment = {
  session_id: string;
  participant_id: string;
};

function principalKey(principal: ControlPrincipal): string {
  return `${principal.token_id}:${principal.client_id}`;
}

/**
 * Tracks connected MCP sessions per space (handshake registration + reachability
 * + server→client publish). This is the MCP session registry for the live
 * `mcp_session` executor and `/v1/mcp/session/handshake` — not a trigger dispatch
 * path. Retired trigger-action wires fail fast in `TriggerDispatcher`.
 */
export class McpSessionRegistry {
  private readonly connected = new Map<string, Map<string, ControlPrincipal>>();
  private readonly connectCallbacks: Array<
    (principal: ControlPrincipal, meeting?: McpMeetingAssignment) => void
  > = [];

  constructor(private readonly controlBus: ControlBus) {}

  onConnect(
    callback: (principal: ControlPrincipal, meeting?: McpMeetingAssignment) => void,
  ): void {
    this.connectCallbacks.push(callback);
  }

  connect(principal: ControlPrincipal, meeting?: McpMeetingAssignment): void {
    const bare = bareSpaceId(principal.space_id);
    const principals = this.connected.get(bare) ?? new Map();
    const key = principalKey(principal);
    const firstConnection = !principals.has(key);
    principals.set(key, principal);
    this.connected.set(bare, principals);
    if (!firstConnection && !meeting) return;
    for (const cb of this.connectCallbacks) {
      cb(principal, meeting);
    }
  }

  disconnect(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    this.connected.get(bare)?.delete(principalKey(principal));
  }

  hasConnectedSession(spaceId: string): boolean {
    const bare = bareSpaceId(spaceId);
    const principals = this.connected.get(bare);
    return Boolean(principals && principals.size > 0);
  }

  connectedPrincipals(spaceId: string): ControlPrincipal[] {
    const bare = bareSpaceId(spaceId);
    const principals = this.connected.get(bare);
    return principals ? [...principals.values()] : [];
  }
}
