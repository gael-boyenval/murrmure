export type FederationRelayStatus = "connected" | "degraded" | "disconnected" | "local_only";

export interface FederationPeerRecord {
  hub_id: string;
  endpoint: string;
  status: "active" | "disabled";
  routing?: Record<string, unknown>;
  auth_token?: string;
}

export interface FederationIngressEnvelope {
  source_hub_id: string;
  event_id: string;
  event_type: string;
  space_id: string;
  payload: Record<string, unknown>;
  federation?: {
    origin_hub_id: string;
    origin_seq?: number;
    ingress?: boolean;
  };
}

export interface FederationPort {
  listPeers(): Promise<FederationPeerRecord[]>;
  getPeer(hub_id: string): Promise<FederationPeerRecord | null>;
  registerPeer(input: {
    hub_id: string;
    endpoint: string;
    auth_token?: string;
    routing?: Record<string, unknown>;
  }): Promise<FederationPeerRecord>;
  checkPeerHealth(hub_id: string): Promise<{ reachable: boolean; detail?: string }>;
  enqueueOutbound(input: {
    target_hub_id: string;
    payload: Record<string, unknown>;
  }): Promise<{ outbound_id: string }>;
  claimOutbound(limit: number): Promise<Array<{ outbound_id: string; target_hub_id: string; payload: Record<string, unknown> }>>;
  completeOutbound(outbound_id: string): Promise<void>;
  ingestEvent(envelope: FederationIngressEnvelope): Promise<{ accepted: boolean; duplicate?: boolean; reason?: string }>;
  status(): Promise<{
    connected_hubs: number;
    relay_status: FederationRelayStatus;
    pending_outbound: number;
  }>;
}
