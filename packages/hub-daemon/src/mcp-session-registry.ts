import type { ControlBus, ControlPrincipal } from "./control-bus.js";
import { bareSpaceId } from "./space-id.js";

/**
 * Tracks connected MCP sessions per space (handshake registration + reachability
 * + server→client publish). This is the MCP session registry for the live
 * `mcp_session` executor and `/v1/mcp/session/handshake` — not a trigger dispatch
 * path. Retired trigger-action wires fail fast in `TriggerDispatcher`.
 */
export class McpSessionRegistry {
  private readonly connected = new Map<string, Set<ControlPrincipal>>();
  private readonly connectCallbacks: Array<(principal: ControlPrincipal) => void> = [];

  constructor(private readonly controlBus: ControlBus) {}

  onConnect(callback: (principal: ControlPrincipal) => void): void {
    this.connectCallbacks.push(callback);
  }

  connect(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    const set = this.connected.get(bare) ?? new Set();
    set.add(principal);
    this.connected.set(bare, set);
    for (const cb of this.connectCallbacks) {
      cb(principal);
    }
  }

  disconnect(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    const set = this.connected.get(bare);
    set?.delete(principal);
  }

  hasConnectedSession(spaceId: string): boolean {
    const bare = bareSpaceId(spaceId);
    const set = this.connected.get(bare);
    return Boolean(set && set.size > 0);
  }

  connectedPrincipals(spaceId: string): ControlPrincipal[] {
    const bare = bareSpaceId(spaceId);
    const set = this.connected.get(bare);
    return set ? [...set] : [];
  }
}
