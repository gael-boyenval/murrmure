import type { FederationPort, FederationIngressEnvelope, FederationPeerRecord } from "./port.js";
import {
  checkPeerReachability,
  getRegisteredPeer,
  listRegisteredPeers,
  registerPeerHub,
  type FederationRegistryDeps,
} from "./registry.js";
import { ingestFederationEvent, type FederationIngressDeps } from "./ingress.js";
import {
  claimFederationRelayBatch,
  computeFederationStatus,
  enqueueFederationRelay,
  type FederationOutboundDeps,
} from "./outbound-queue.js";

export interface CreateFederationPortDeps {
  registry: FederationRegistryDeps;
  outbound: FederationOutboundDeps;
  ingress: FederationIngressDeps;
  clock: { nowIso(): string };
}

export function createFederationPort(deps: CreateFederationPortDeps): FederationPort {
  return {
    async listPeers(): Promise<FederationPeerRecord[]> {
      return listRegisteredPeers(deps.registry);
    },
    async getPeer(hub_id: string): Promise<FederationPeerRecord | null> {
      return getRegisteredPeer(deps.registry, hub_id);
    },
    async registerPeer(input) {
      return registerPeerHub(deps.registry, input);
    },
    async checkPeerHealth(hub_id: string) {
      const result = await checkPeerReachability(deps.registry, hub_id);
      return { reachable: result.reachable, detail: result.detail };
    },
    async enqueueOutbound(input) {
      return enqueueFederationRelay(deps.outbound, input);
    },
    async claimOutbound(limit: number) {
      return claimFederationRelayBatch(deps.outbound, limit);
    },
    async completeOutbound(outbound_id: string) {
      await deps.outbound.complete(outbound_id);
    },
    async ingestEvent(envelope: FederationIngressEnvelope) {
      return ingestFederationEvent(deps.ingress, envelope, deps.clock);
    },
    async status() {
      return computeFederationStatus(deps.registry, {
        countPending: () => deps.outbound.countPending(),
      });
    },
  };
}
