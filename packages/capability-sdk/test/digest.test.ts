import { describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeBundleDigest, BUNDLE_DIGEST_EXCLUDED } from "../src/digest.js";

describe("bundle digest", () => {
  test("excludes sidecar files including bundle.digest", () => {
    expect(BUNDLE_DIGEST_EXCLUDED).toContain("bundle.digest");
    expect(BUNDLE_DIGEST_EXCLUDED).toContain("build.meta.json");
  });

  test("digest is stable when bundle.digest sidecar is written after compute", async () => {
    const base = mkdtempSync(join(tmpdir(), "cap-digest-"));
    try {
      mkdirSync(join(base, "contract"), { recursive: true });
      mkdirSync(join(base, "ui"), { recursive: true });
      writeFileSync(join(base, "manifest.json"), JSON.stringify({ id: "demo" }));
      writeFileSync(join(base, "contract", "contract.json"), "{}");
      writeFileSync(join(base, "ui", "entry.js"), "export function mount() {}\n");

      const digestBeforeSidecar = await computeBundleDigest(base);
      writeFileSync(join(base, "bundle.digest"), `${digestBeforeSidecar}\n`);
      writeFileSync(join(base, "build.meta.json"), JSON.stringify({ built_at: "now" }));

      const digestAfterSidecars = await computeBundleDigest(base);
      expect(digestAfterSidecars).toBe(digestBeforeSidecar);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
