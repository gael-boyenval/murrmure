import type { HubHandler } from "@studio/hub-core";
import type { ControlBus, ControlPrincipal } from "./control-bus.js";
import { bareSpaceId } from "./space-id.js";

export interface McpWakeArgs {
  target_space_id: string;
  wake_label: string;
  payload: unknown;
  session_hint: "wake";
}

export class McpWakeDispatcher {
  private readonly spacePending = new Map<string, Array<{ wake_label: string; payload: unknown; enqueued_at: number }>>();
  private readonly connected = new Map<string, Set<ControlPrincipal>>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly controlBus: ControlBus,
    private readonly handler: HubHandler,
  ) {}

  connect(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    const set = this.connected.get(bare) ?? new Set();
    set.add(principal);
    this.connected.set(bare, set);
    this.flushPending(principal);
  }

  disconnect(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    const set = this.connected.get(bare);
    set?.delete(principal);
  }

  async wake(args: McpWakeArgs): Promise<void> {
    const bare = bareSpaceId(args.target_space_id);
    const principals = this.connected.get(bare);
    const delivered = principals && principals.size > 0;

    if (delivered) {
      for (const p of principals!) {
        this.controlBus.publish(p, {
          method: "studio/control.wake_pending",
          params: { wake_label: args.wake_label, payload: args.payload },
        });
      }
      await this.handler.execute({
        kind: "event.append",
        provenance: {
          space_id: args.target_space_id,
          actor_id: "system_mcp_wake",
          token_id: "system",
        },
        event_type: "mcp.wake_delivered",
        payload: {
          wake_label: args.wake_label,
          target_space_id: args.target_space_id,
          payload_hash: hashPayload(args.payload),
        },
      } as never);
      return;
    }

    const queue = this.spacePending.get(bare) ?? [];
    queue.push({ wake_label: args.wake_label, payload: args.payload, enqueued_at: Date.now() });
    this.purgeSpacePending(bare);
    this.spacePending.set(bare, queue);

    await this.handler.execute({
      kind: "event.append",
      provenance: {
        space_id: args.target_space_id,
        actor_id: "system_mcp_wake",
        token_id: "system",
      },
      event_type: "mcp.wake_pending",
      payload: {
        wake_label: args.wake_label,
        target_space_id: args.target_space_id,
      },
    } as never);
  }

  private flushPending(principal: ControlPrincipal): void {
    const bare = bareSpaceId(principal.space_id);
    const queue = this.spacePending.get(bare);
    if (!queue?.length) return;
    for (const item of queue) {
      this.controlBus.publish(principal, {
        method: "studio/control.wake_pending",
        params: { wake_label: item.wake_label, payload: item.payload },
      });
    }
    this.spacePending.delete(bare);
  }

  private purgeSpacePending(spaceId: string): void {
    const queue = this.spacePending.get(spaceId);
    if (!queue) return;
    const now = Date.now();
    const kept = queue.filter((q) => now - q.enqueued_at < this.ttlMs);
    if (kept.length === 0) this.spacePending.delete(spaceId);
    else this.spacePending.set(spaceId, kept);
  }
}

function hashPayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url").slice(0, 16);
}
