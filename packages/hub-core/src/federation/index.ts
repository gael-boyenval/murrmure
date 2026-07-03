export type {
  FederationPort,
  FederationPeerRecord,
  FederationIngressEnvelope,
  FederationRelayStatus,
} from "./port.js";
export {
  parsePeerRecord,
  getRegisteredPeer,
  registerPeerHub,
  checkPeerReachability,
  listRegisteredPeers,
  type FederationRegistryDeps,
} from "./registry.js";
export {
  ingestFederationEvent,
  type FederationIngressDeps,
  type IngressResult,
} from "./ingress.js";
export {
  enqueueFederationRelay,
  claimFederationRelayBatch,
  computeFederationStatus,
  type FederationOutboundDeps,
} from "./outbound-queue.js";
export { createFederationPort } from "./service.js";
