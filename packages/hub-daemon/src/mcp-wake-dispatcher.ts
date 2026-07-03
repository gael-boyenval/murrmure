import type { ControlBus, ControlPrincipal } from "./control-bus.js";
import { bareSpaceId } from "./space-id.js";

export class McpWakeDispatcher {
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
