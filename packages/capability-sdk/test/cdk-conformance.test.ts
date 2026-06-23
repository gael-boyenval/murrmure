import { describe, expect, test, beforeAll } from "vitest";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { examplesRoot } from "../src/paths.js";
import { validateCapabilityRoot } from "../src/validate.js";
import { buildCapabilityRoot } from "../src/build.js";

const root = examplesRoot();
const examples = readdirSync(root).filter((name) => {
  try {
    return statSync(join(root, name, "capability.manifest.json")).isFile();
  } catch {
    return false;
  }
});

describe("CDK example conformance", () => {
  beforeAll(() => {
    expect(examples.length).toBeGreaterThan(0);
  });

  test.each(examples)("%s validates, builds, and has a stable digest", async (name) => {
    const dir = join(root, name);

    const validation = validateCapabilityRoot(dir);
    expect(validation.errors, JSON.stringify(validation.errors)).toEqual([]);
    expect(validation.manifest?.id).toBe(name);

    const outA = mkdtempSync(join(tmpdir(), `cdk-${name}-a-`));
    const outB = mkdtempSync(join(tmpdir(), `cdk-${name}-b-`));
    try {
      const a = await buildCapabilityRoot(dir, { outDir: outA });
      const b = await buildCapabilityRoot(dir, { outDir: outB });

      expect(a.ok, JSON.stringify(a.errors)).toBe(true);
      expect(b.ok).toBe(true);
      expect(a.bundleDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(a.bundleDigest).toBe(b.bundleDigest);

      const postBuild = validateCapabilityRoot(a.stageDir, { postBuild: true });
      expect(postBuild.errors, JSON.stringify(postBuild.errors)).toEqual([]);
    } finally {
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  });
});
