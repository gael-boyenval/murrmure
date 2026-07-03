import type { ArtifactV1 } from "@murrmure/contracts";
import { computeBytesDigest } from "./digest.js";

export const DEFAULT_ARTIFACT_TTL_DAYS = 7;

export interface RegisterArtifactInput {
  transfer_id: string;
  source_space_id: string;
  name: string;
  bytes: Uint8Array;
  authorized_readers: string[];
  hold?: boolean;
  ttl_days?: number;
  now?: Date;
}

export interface RegisteredArtifact {
  manifest: ArtifactV1;
  expires_at: string;
  digest: string;
  size_bytes: number;
}

export function buildArtifactExpiresAt(ttlDays: number, now = new Date()): string {
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + ttlDays);
  return expires.toISOString();
}

export function registerArtifactManifest(input: RegisterArtifactInput): RegisteredArtifact {
  const digest = computeBytesDigest(input.bytes);
  const size_bytes = input.bytes.byteLength;
  const ttlDays = input.ttl_days ?? DEFAULT_ARTIFACT_TTL_DAYS;
  const expires_at = buildArtifactExpiresAt(ttlDays, input.now);

  const manifest: ArtifactV1 = {
    kind: "mrmr.artifact/v1",
    transfer_id: input.transfer_id,
    digest,
    name: input.name,
    size_bytes,
    authorized_readers: input.authorized_readers,
    hold: input.hold ?? false,
  };

  return {
    manifest: { ...manifest, authorized_readers: [...input.authorized_readers] },
    expires_at,
    digest,
    size_bytes,
  };
}

export function isArtifactExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
