import { join } from "node:path";
import { computeBytesDigest } from "./digest.js";
import { relativeInboxPath } from "./paths.js";
import { isArtifactReaderAuthorized } from "./acl.js";
import { isArtifactExpired } from "./register.js";

export interface MaterializePlan {
  transfer_id: string;
  name: string;
  digest: string;
  absolute_path: string;
  relative_path: string;
}

export function planMaterialize(input: {
  transfer_id: string;
  name: string;
  digest: string;
  space_root: string;
  authorized_readers: string[];
  requester_space_id: string;
  requester_actor_id: string;
  expires_at: string;
  bytes: Uint8Array;
  now?: Date;
}): MaterializePlan | { code: string; message: string } {
  if (isArtifactExpired(input.expires_at, input.now)) {
    return { code: "ARTIFACT_EXPIRED", message: `Artifact '${input.transfer_id}' has expired` };
  }

  if (
    !isArtifactReaderAuthorized(
      input.authorized_readers,
      input.requester_space_id,
      input.requester_actor_id,
    )
  ) {
    return {
      code: "ARTIFACT_ACCESS_DENIED",
      message: `Reader is not authorized for artifact '${input.transfer_id}'`,
    };
  }

  const actualDigest = computeBytesDigest(input.bytes);
  if (actualDigest !== input.digest) {
    return {
      code: "ARTIFACT_DIGEST_MISMATCH",
      message: `Digest mismatch for artifact '${input.transfer_id}' (expected ${input.digest}, got ${actualDigest})`,
    };
  }

  return {
    transfer_id: input.transfer_id,
    name: input.name,
    digest: input.digest,
    absolute_path: join(input.space_root, relativeInboxPath(input.transfer_id, input.name)),
    relative_path: relativeInboxPath(input.transfer_id, input.name),
  };
}
