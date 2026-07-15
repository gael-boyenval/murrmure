import { describe, expect, test } from "vitest";
import {
  loadRelayedArtifactBytes,
  RelayedArtifactValidationError,
  computeBytesDigest,
  type RelayedArtifactLocalRecord,
  type RelayedArtifactRemoteResult,
} from "@murrmure/hub-core";

const REQUESTER = "spc_consumer";
const ACTOR = "actor_consumer";
const TRANSFER_ID = "xfr_test";

function localRecord(input: {
  authorized_readers?: string[];
  digest?: string;
  expiresAt?: string;
  bytes?: Uint8Array;
  name?: string;
}): RelayedArtifactLocalRecord {
  const bytes = input.bytes ?? new TextEncoder().encode("payload-bytes");
  return {
    manifest: {
      authorized_readers: input.authorized_readers ?? [REQUESTER],
      digest: input.digest ?? computeBytesDigest(bytes),
      name: input.name ?? "payload.txt",
    },
    expires_at: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    bytes,
  };
}

describe("loadRelayedArtifactBytes", () => {
  test("local success returns validated bytes + digest", async () => {
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => localRecord({}),
    });
    expect(result).not.toBeNull();
    expect(result!.digest).toBe(computeBytesDigest(new TextEncoder().encode("payload-bytes")));
  });

  test("local ACL denied throws ARTIFACT_ACCESS_DENIED", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => localRecord({ authorized_readers: ["spc_other"] }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_ACCESS_DENIED" });
  });

  test("local expired throws ARTIFACT_EXPIRED", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () =>
          localRecord({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_EXPIRED" });
  });

  test("local digest mismatch throws ARTIFACT_DIGEST_MISMATCH", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => localRecord({ digest: "sha256:wrong" }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_DIGEST_MISMATCH" });
  });

  test("remote success (bytes + declared digest) returns validated bytes", async () => {
    const bytes = new TextEncoder().encode("remote-bytes");
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => null,
      fetchRemote: async (): Promise<RelayedArtifactRemoteResult> => ({
        status: 200,
        bytes,
        digest: computeBytesDigest(bytes),
      }),
    });
    expect(result).not.toBeNull();
    expect(result!.digest).toBe(computeBytesDigest(bytes));
  });

  test("remote success without digest header computes the digest", async () => {
    const bytes = new TextEncoder().encode("remote-bytes-no-header");
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => null,
      fetchRemote: async () => ({ status: 200, bytes }),
    });
    expect(result).not.toBeNull();
    expect(result!.digest).toBe(computeBytesDigest(bytes));
  });

  test("remote 403 throws ARTIFACT_ACCESS_DENIED", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => null,
        fetchRemote: async () => ({ status: 403, message: "denied" }),
      }),
    ).rejects.toBeInstanceOf(RelayedArtifactValidationError);
  });

  test("remote 410 throws ARTIFACT_EXPIRED", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => null,
        fetchRemote: async () => ({ status: 410 }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_EXPIRED" });
  });

  test("remote 404 throws ARTIFACT_NOT_FOUND", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => null,
        fetchRemote: async () => ({ status: 404 }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
  });

  test("remote 422 throws ARTIFACT_DIGEST_MISMATCH", async () => {
    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: REQUESTER,
        requester_actor_id: ACTOR,
        loadLocal: async () => null,
        fetchRemote: async () => ({ status: 422 }),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_DIGEST_MISMATCH" });
  });

  test("remote 5xx is a transient best-effort skip (null)", async () => {
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => null,
      fetchRemote: async () => ({ status: 503 }),
    });
    expect(result).toBeNull();
  });

  test("remote transport error is a transient best-effort skip (null)", async () => {
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => null,
      fetchRemote: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(result).toBeNull();
  });

  test("no local store and no remote fetcher returns null", async () => {
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
    });
    expect(result).toBeNull();
  });

  test("local hit takes precedence over remote fetch", async () => {
    let remoteCalled = false;
    const result = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => localRecord({ bytes: new TextEncoder().encode("local") }),
      fetchRemote: async () => {
        remoteCalled = true;
        return { status: 200, bytes: new TextEncoder().encode("remote") };
      },
    });
    expect(result!.digest).toBe(computeBytesDigest(new TextEncoder().encode("local")));
    expect(remoteCalled).toBe(false);
  });

  test("local ACL binds to the requester space principal (parity with artifacts_in)", async () => {
    // The same artifact record is authorized to `spc_consumer` only. The
    // consumer context's `requester_space_id` is the ACL principal — an
    // authorized requester resolves, a different (unbound) requester is
    // denied with the same code as `artifacts_in`.
    const record = localRecord({ authorized_readers: [REQUESTER] });
    const authorized = await loadRelayedArtifactBytes({
      transfer_id: TRANSFER_ID,
      requester_space_id: REQUESTER,
      requester_actor_id: ACTOR,
      loadLocal: async () => record,
    });
    expect(authorized).not.toBeNull();

    await expect(
      loadRelayedArtifactBytes({
        transfer_id: TRANSFER_ID,
        requester_space_id: "spc_other",
        requester_actor_id: "actor_other",
        loadLocal: async () => record,
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_ACCESS_DENIED" });
  });
});
