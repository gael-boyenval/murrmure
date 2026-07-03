import type { FederationRelayStatus } from "./port.js";
import { listRegisteredPeers } from "./registry.js";
import type { FederationRegistryDeps } from "./registry.js";

export interface FederationOutboundDeps {
  enqueue(row: Record<string, unknown>): Promise<void>;
  claim(limit: number): Promise<Array<Record<string, unknown>>>;
  complete(outbound_id: string): Promise<void>;
  countPending(): Promise<number>;
  createId(): string;
  clock: { nowIso(): string };
}

export async function enqueueFederationRelay(
  deps: FederationOutboundDeps,
  input: { target_hub_id: string; payload: Record<string, unknown> },
): Promise<{ outbound_id: string }> {
  const outbound_id = deps.createId();
  await deps.enqueue({
    outbound_id,
    target_hub_id: input.target_hub_id,
    payload: input.payload,
    status: "pending",
    created_at: deps.clock.nowIso(),
  });
  return { outbound_id };
}

export async function claimFederationRelayBatch(deps: FederationOutboundDeps, limit: number) {
  const rows = await deps.claim(limit);
  return rows.map((row) => ({
    outbound_id: String(row.outbound_id),
    target_hub_id: String(row.target_hub_id),
    payload:
      typeof row.payload_json === "string"
        ? (JSON.parse(row.payload_json) as Record<string, unknown>)
        : ((row.payload as Record<string, unknown>) ?? {}),
  }));
}

export async function computeFederationStatus(
  registryDeps: FederationRegistryDeps,
  outboundDeps: { countPending(): Promise<number> },
): Promise<{
  connected_hubs: number;
  relay_status: FederationRelayStatus;
  pending_outbound: number;
}> {
  const peers = await listRegisteredPeers(registryDeps);
  const activePeers = peers.filter((p) => p.status === "active");
  const pendingCount = await outboundDeps.countPending();
  const relay_status: FederationRelayStatus =
    activePeers.length === 0 ? "local_only" : pendingCount > 0 ? "degraded" : "connected";

  return {
    connected_hubs: activePeers.length,
    relay_status,
    pending_outbound: pendingCount,
  };
}
