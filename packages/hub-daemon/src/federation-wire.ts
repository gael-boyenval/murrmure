import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import {
  createFederationPort,
  type FederationPort,
} from "@murrmure/hub-core";
import { timingSafeEqual } from "node:crypto";
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
    `${base}/v1/federation/relay/spaces/${spaceId}/actions/${encodeURIComponent(input.action_name)}/invoke`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input.body),
    },
  );
}

/** Authenticated peer identity for a federation relay call. `actor_id` /
 *  `token_id` are synthesized for audit — the relay trusts the peer
 *  relationship, not a space-connection token. */
export interface PeerAuth {
  hub_id: string;
  actor_id: string;
  token_id: string;
}

function peerCredentialMatches(stored: string | undefined, presented: string): boolean {
  if (!stored || !presented) return false;
  const a = Buffer.from(stored, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function peerDenied(): Response {
  return new Response(
    JSON.stringify({
      code: "FEDERATION_PEER_DENIED",
      message: "Federation relay requires a registered peer credential",
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

/**
 * Authenticate a federation relay caller as a registered peer hub. The relay is
 * internal hub-to-hub dispatch — it must NOT accept ordinary space-connection
 * `flow:run` tokens. A caller is a peer only when its Bearer credential
 * matches a registered peer's `auth_token` (constant-time). Non-peer callers
 * (including any ordinary space token) receive 403 FEDERATION_PEER_DENIED.
 */
export async function requirePeerAuth(
  federationPort: FederationPort,
  req: Request,
): Promise<PeerAuth | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return peerDenied();
  const presented = auth.slice("Bearer ".length).trim();
  if (!presented) return peerDenied();

  const peers = await federationPort.listPeers();
  const peer = peers.find(
    (p) => p.status === "active" && peerCredentialMatches(p.auth_token, presented),
  );
  if (!peer) return peerDenied();

  return {
    hub_id: peer.hub_id,
    actor_id: `federation:${peer.hub_id}`,
    token_id: `peer:${peer.hub_id}`,
  };
}
