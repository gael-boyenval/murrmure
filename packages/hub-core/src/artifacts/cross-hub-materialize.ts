import type { FederationPeerRecord } from "../federation/port.js";
import { planMaterialize, type MaterializePlan } from "./materialize.js";

export interface CrossHubArtifactDescriptor {
  transfer_id: string;
  digest: string;
  name: string;
  source_space_id: string;
  authorized_readers: string[];
  expires_at: string;
}

export interface CrossHubMaterializeDeps {
  getPeer(hub_id: string): Promise<FederationPeerRecord | null>;
  fetchDescriptorFromPeer(input: {
    peer: FederationPeerRecord;
    transfer_id: string;
    requester_space_id: string;
  }): Promise<CrossHubArtifactDescriptor | { code: string; message: string }>;
  fetchBytesFromPeer(input: {
    peer: FederationPeerRecord;
    transfer_id: string;
  }): Promise<Uint8Array | { code: string; message: string }>;
}

/** Authorize + fetch artifact descriptor from peer exchange store (§16b F2). */
export async function materializeCrossHubArtifact(
  deps: CrossHubMaterializeDeps,
  input: {
    peer_hub_id: string;
    transfer_id: string;
    digest: string;
    name: string;
    space_root: string;
    requester_space_id: string;
    requester_actor_id: string;
    now?: Date;
  },
): Promise<MaterializePlan | { code: string; message: string }> {
  const peer = await deps.getPeer(input.peer_hub_id);
  if (!peer) {
    return { code: "FEDERATION_PEER_UNKNOWN", message: `Unknown peer hub '${input.peer_hub_id}'` };
  }

  const descriptor = await deps.fetchDescriptorFromPeer({
    peer,
    transfer_id: input.transfer_id,
    requester_space_id: input.requester_space_id,
  });
  if ("code" in descriptor) {
    return descriptor;
  }

  if (descriptor.digest !== input.digest) {
    return {
      code: "ARTIFACT_DIGEST_MISMATCH",
      message: `Peer digest mismatch for '${input.transfer_id}'`,
    };
  }

  const bytes = await deps.fetchBytesFromPeer({ peer, transfer_id: input.transfer_id });
  if ("code" in bytes) {
    return bytes;
  }

  return planMaterialize({
    transfer_id: input.transfer_id,
    name: input.name || descriptor.name,
    digest: input.digest,
    space_root: input.space_root,
    authorized_readers: descriptor.authorized_readers,
    requester_space_id: input.requester_space_id,
    requester_actor_id: input.requester_actor_id,
    expires_at: descriptor.expires_at,
    bytes,
    now: input.now,
  });
}
