import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import {
  createFederationPort,
  type FederationPort,
} from "@murrmure/hub-core";
import { ulid } from "ulid";

export interface FederationWireConfig {
  hub_id?: string;
  auth_token?: string;
}

export function createDaemonFederationPort(
  studio: StudioPersistencePort,
  config: FederationWireConfig = {},
): FederationPort {
  const clock = { nowIso: () => new Date().toISOString() };

  return createFederationPort({
    registry: {
      getPeer: (hub_id) => studio.getFederationHub(hub_id),
      listPeers: () => studio.listFederationHubs(),
      insertPeer: (row) => studio.insertFederationHub(row),
      healthCheck: async (endpoint, auth_token) => {
        try {
          const headers: Record<string, string> = {};
          const token = auth_token ?? config.auth_token;
          if (token) headers.Authorization = `Bearer ${token}`;
          const res = await fetch(`${endpoint.replace(/\/$/, "")}/v1/health`, { headers });
          return { ok: res.ok, detail: res.ok ? undefined : `Health check failed (${res.status})` };
        } catch (error) {
          return {
            ok: false,
            detail: error instanceof Error ? error.message : "Health check failed",
          };
        }
      },
    },
    outbound: {
      enqueue: (row) => studio.enqueueFederationOutbound(row),
      claim: (limit) => studio.claimFederationOutbound(limit),
      complete: (outbound_id) => studio.completeFederationOutbound(outbound_id),
      countPending: () => studio.countFederationOutboundPending(),
      createId: () => ulid(),
      clock,
    },
    ingress: {
      hasDedup: (source, event_id) => studio.hasFederationIngressDedup(source, event_id),
      recordDedup: (source, event_id, at) =>
        studio.insertFederationIngressDedup(source, event_id, at),
    },
    clock,
  });
}

export async function relayRemoteInvoke(input: {
  peerEndpoint: string;
  authToken?: string;
  remote_space_id: string;
  action_name: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const base = input.peerEndpoint.replace(/\/$/, "");
  const spaceId = input.remote_space_id.startsWith("spc_")
    ? input.remote_space_id
    : `spc_${input.remote_space_id}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.authToken) headers.Authorization = `Bearer ${input.authToken}`;

  return fetch(
    `${base}/v1/spaces/${spaceId}/actions/${encodeURIComponent(input.action_name)}/invoke`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input.body),
    },
  );
}
