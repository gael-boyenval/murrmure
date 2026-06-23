import { describe, expect, test, beforeAll } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { templatesRoot } from "../src/paths.js";
import { validateFlowRoot } from "../src/validate.js";
import { buildFlowRoot } from "../src/build.js";

const root = templatesRoot();
const examples = readdirSync(root).filter((name) => {
  try {
    return statSync(join(root, name, "flow.manifest.json")).isFile();
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

    const validation = validateFlowRoot(dir);
    expect(validation.errors, JSON.stringify(validation.errors)).toEqual([]);
    expect(validation.manifest?.id).toBe(name);

    const outA = mkdtempSync(join(tmpdir(), `cdk-${name}-a-`));
    const outB = mkdtempSync(join(tmpdir(), `cdk-${name}-b-`));
    try {
      const a = await buildFlowRoot(dir, { outDir: outA });
      const b = await buildFlowRoot(dir, { outDir: outB });

      expect(a.ok, JSON.stringify(a.errors)).toBe(true);
      expect(b.ok).toBe(true);
      expect(a.bundleDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(a.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(existsSync(join(outA, "bundle.tar.zst"))).toBe(true);
      expect(existsSync(join(outA, "source.tar.zst"))).toBe(true);

      const postBuild = validateFlowRoot(a.stageDir, { postBuild: true });
      expect(postBuild.errors, JSON.stringify(postBuild.errors)).toEqual([]);
    } finally {
      rmSync(outA, { recursive: true, force: true });
      rmSync(outB, { recursive: true, force: true });
    }
  });
});
