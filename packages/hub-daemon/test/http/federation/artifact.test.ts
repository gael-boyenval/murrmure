import { describe, expect, test } from "vitest";
import { materializeCrossHubArtifact, computeBytesDigest } from "@murrmure/hub-core";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("federation/artifact", () => {
  test("cross-hub materialize authorizes and verifies digest", async () => {
    const root = mkdtempSync(join(tmpdir(), "fed-artifact-"));
    const bytes = new TextEncoder().encode("cross-hub-payload");
    const digest = computeBytesDigest(bytes);

    try {
      const result = await materializeCrossHubArtifact(
        {
          getPeer: async () => ({
            hub_id: "hub_b",
            endpoint: "http://127.0.0.1:9999",
            status: "active",
          }),
          fetchDescriptorFromPeer: async () => ({
            transfer_id: "xfr_test",
            digest,
            name: "payload.txt",
            source_space_id: "spc_source",
            authorized_readers: ["spc_virtual"],
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }),
          fetchBytesFromPeer: async () => bytes,
        },
        {
          peer_hub_id: "hub_b",
          transfer_id: "xfr_test",
          digest,
          name: "payload.txt",
          space_root: root,
          requester_space_id: "spc_virtual",
          requester_actor_id: "actor_test",
        },
      );

      expect("code" in result).toBe(false);
      if (!("code" in result)) {
        expect(result.relative_path).toContain(".mrmr.temp/inbox");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
