import type { FederationPeerRecord } from "./port.js";

export interface FederationRegistryDeps {
  getPeer(hub_id: string): Promise<Record<string, unknown> | null>;
  listPeers?(): Promise<Array<Record<string, unknown>>>;
  insertPeer(row: Record<string, unknown>): Promise<void>;
  healthCheck(endpoint: string, auth_token?: string): Promise<{ ok: boolean; detail?: string }>;
}

export function parsePeerRecord(row: Record<string, unknown>): FederationPeerRecord {
  const routing =
    typeof row.routing_json === "string"
      ? (JSON.parse(row.routing_json) as Record<string, unknown>)
      : ((row.routing as Record<string, unknown> | undefined) ?? {});
  return {
    hub_id: String(row.hub_id),
    endpoint: String(row.endpoint),
    status: row.status === "disabled" ? "disabled" : "active",
    routing,
    auth_token: typeof routing.auth_token === "string" ? routing.auth_token : undefined,
  };
}

export async function getRegisteredPeer(
  deps: FederationRegistryDeps,
  hub_id: string,
): Promise<FederationPeerRecord | null> {
  const row = await deps.getPeer(hub_id);
  return row ? parsePeerRecord(row) : null;
}

export async function registerPeerHub(
  deps: FederationRegistryDeps,
  input: {
    hub_id: string;
    endpoint: string;
    auth_token?: string;
    routing?: Record<string, unknown>;
  },
): Promise<FederationPeerRecord> {
  const routing = { ...(input.routing ?? {}), ...(input.auth_token ? { auth_token: input.auth_token } : {}) };
  await deps.insertPeer({
    hub_id: input.hub_id,
    endpoint: input.endpoint,
    status: "active",
    routing,
  });
  return {
    hub_id: input.hub_id,
    endpoint: input.endpoint,
    status: "active",
    routing,
    auth_token: input.auth_token,
  };
}

export async function checkPeerReachability(
  deps: FederationRegistryDeps,
  hub_id: string,
): Promise<{ reachable: boolean; detail?: string; peer?: FederationPeerRecord }> {
  const peer = await getRegisteredPeer(deps, hub_id);
  if (!peer) {
    return { reachable: false, detail: `Unknown federation peer '${hub_id}'` };
  }
  if (peer.status === "disabled") {
    return { reachable: false, detail: `Peer '${hub_id}' is disabled`, peer };
  }
  const health = await deps.healthCheck(peer.endpoint, peer.auth_token);
  return {
    reachable: health.ok,
    detail: health.detail,
    peer,
  };
}

export async function listRegisteredPeers(deps: FederationRegistryDeps): Promise<FederationPeerRecord[]> {
  if (!deps.listPeers) return [];
  const rows = await deps.listPeers();
  return rows.map(parsePeerRecord);
}
