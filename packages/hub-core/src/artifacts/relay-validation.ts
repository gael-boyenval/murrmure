import { planMaterialize } from "./materialize.js";
import { computeBytesDigest } from "./digest.js";

/**
 * A typed validation failure raised while resolving a relayed artifact reference
 * across a federation boundary. Codes mirror the `artifacts_in` resolution path
 * (`resolveArtifactsIn` → `planMaterialize`) so the relayed-invoke path enforces
 * the same ACL / expiry / digest checks a normal invoke does — a caller-supplied
 * `step_contract` may not bypass artifact authorization.
 */
export class RelayedArtifactValidationError extends Error {
  constructor(
    public readonly code:
      | "ARTIFACT_ACCESS_DENIED"
      | "ARTIFACT_EXPIRED"
      | "ARTIFACT_NOT_FOUND"
      | "ARTIFACT_DIGEST_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "RelayedArtifactValidationError";
  }
}

/** Validated bytes for one relayed artifact reference, ready to materialize. */
export interface RelayedArtifactBytes {
  bytes: Uint8Array;
  /** `sha256:<hex>` of the validated bytes. */
  digest: string;
}

/**
 * A locally-registered artifact record the destination hub may already hold
 * (idempotent re-materialization, or a same-hub relay). Mirrors the shape of
 * `ArtifactService.loadArtifactForInvoke`.
 */
export interface RelayedArtifactLocalRecord {
  manifest: {
    authorized_readers: string[];
    digest: string;
    name: string;
  };
  expires_at: string;
  bytes: Uint8Array;
}

/**
 * The outcome of fetching artifact bytes from the producer hub's
 * `GET /v1/artifacts/:transfer_id/bytes` endpoint. `status` is the HTTP status;
 * `bytes` / `digest` are present on 200; `message` carries the producer error
 * body for non-200 validation failures.
 */
export interface RelayedArtifactRemoteResult {
  status: number;
  bytes?: Uint8Array;
  digest?: string;
  message?: string;
}

/**
 * Resolve and validate one relayed artifact reference before materialization.
 *
 * The destination hub first tries its local artifact store (`loadLocal`); when
 * bytes are present they are validated with `planMaterialize`, which enforces
 * expiry, `authorized_readers` ACL, and digest — the same checks the normal
 * `artifacts_in` path runs. When bytes are not local, the reference is fetched
 * from the producer hub (`fetchRemote`); the producer's bytes endpoint enforces
 * ACL / expiry / digest, and definitive failures (403 / 410 / 404 / 422) are
 * re-raised as {@link RelayedArtifactValidationError} so the relayed invoke is
 * rejected with parity codes. Transient unavailability (network error or a 5xx
 * response) returns `null` so the reference is left for the handler to fetch via
 * the relayed `hub_token` / `hub_url`, preserving the federated best-effort
 * contract for transport failures only.
 *
 * Returns `null` (not an error) when the reference is neither local nor remotely
 * fetchable due to a transient condition. A definitive ACL / expiry / digest /
 * not-found failure always throws.
 */
export async function loadRelayedArtifactBytes(input: {
  transfer_id: string;
  requester_space_id: string;
  requester_actor_id: string;
  loadLocal?: (transfer_id: string) => Promise<RelayedArtifactLocalRecord | null>;
  fetchRemote?: (transfer_id: string) => Promise<RelayedArtifactRemoteResult>;
}): Promise<RelayedArtifactBytes | null> {
  if (input.loadLocal) {
    const local = await input.loadLocal(input.transfer_id);
    if (local) {
      const plan = planMaterialize({
        transfer_id: input.transfer_id,
        name: local.manifest.name,
        digest: local.manifest.digest,
        // Validation-only: the consumer-copy path is computed by
        // `materializeRemoteArtifactReferences`, not here. `planMaterialize`
        // runs its expiry / ACL / digest checks before touching the path.
        space_root: "",
        authorized_readers: local.manifest.authorized_readers,
        requester_space_id: input.requester_space_id,
        requester_actor_id: input.requester_actor_id,
        expires_at: local.expires_at,
        bytes: local.bytes,
      });
      if ("code" in plan) {
        throw new RelayedArtifactValidationError(
          plan.code as RelayedArtifactValidationError["code"],
          plan.message,
        );
      }
      return { bytes: local.bytes, digest: local.manifest.digest };
    }
  }

  if (!input.fetchRemote) return null;

  let remote: RelayedArtifactRemoteResult;
  try {
    remote = await input.fetchRemote(input.transfer_id);
  } catch {
    // Transport unreachable (DNS, connection refused, timeout). Leave the
    // reference for the handler to fetch via the relayed hub_token / hub_url.
    return null;
  }

  if (remote.status === 200 && remote.bytes) {
    const digest = remote.digest ?? computeBytesDigest(remote.bytes);
    return { bytes: remote.bytes, digest };
  }
  if (remote.status === 403) {
    throw new RelayedArtifactValidationError(
      "ARTIFACT_ACCESS_DENIED",
      remote.message ?? `Reader is not authorized for artifact '${input.transfer_id}'`,
    );
  }
  if (remote.status === 410) {
    throw new RelayedArtifactValidationError(
      "ARTIFACT_EXPIRED",
      remote.message ?? `Artifact '${input.transfer_id}' has expired`,
    );
  }
  if (remote.status === 404) {
    throw new RelayedArtifactValidationError(
      "ARTIFACT_NOT_FOUND",
      remote.message ?? `Artifact '${input.transfer_id}' is not registered on the producer hub`,
    );
  }
  if (remote.status === 422) {
    throw new RelayedArtifactValidationError(
      "ARTIFACT_DIGEST_MISMATCH",
      remote.message ?? `Artifact '${input.transfer_id}' digest mismatch on the producer hub`,
    );
  }
  // 5xx / other unexpected non-200: transient — leave for the handler.
  return null;
}
