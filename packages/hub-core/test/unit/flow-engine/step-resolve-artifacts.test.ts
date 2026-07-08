import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureStepWorkdir,
  promoteArtifactsOut,
  mergeArtifactsIntoExecContext,
  buildArtifactMurrmureBindings,
  validateArtifactsOut,
  writeStepWorkdirFile,
  stableArtifactRelPath,
} from "../../../src/flow-engine/step-artifacts.js";

describe("flow-engine/step-resolve-artifacts", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "step-artifacts-"));
  });

  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  test("validateArtifactsOut rejects unknown slots", () => {
    expect(
      validateArtifactsOut([{ slot: "spec", path: "spec.md" }], undefined),
    ).toContain("artifact_slots");
    expect(
      validateArtifactsOut([{ slot: "unknown", path: "x.md" }], { spec: {} }),
    ).toContain("Unknown artifact slot");
    expect(validateArtifactsOut([{ slot: "spec", path: "spec.md" }], { spec: {} })).toBeNull();
  });

  test("ensureStepWorkdir creates scratch directory", async () => {
    const dir = await ensureStepWorkdir(spaceRoot, "run_01TEST", "intake");
    expect(dir).toContain(join("steps", "intake", "work"));
    expect(existsSync(dir)).toBe(true);
  });

  test("promoteArtifactsOut copies work file to stable slot path", async () => {
    await writeStepWorkdirFile({
      space_root: spaceRoot,
      run_id: "run_01TEST",
      step_id: "intake",
      filename: "hero-section.md",
      bytes: Buffer.from("# Hero\n", "utf-8"),
    });

    const promoted = await promoteArtifactsOut({
      space_root: spaceRoot,
      run_id: "run_01TEST",
      step_id: "intake",
      artifacts_out: [{ slot: "spec", path: "hero-section.md" }],
      artifact_slots: { spec: { max_bytes: 65536 } },
      registerArtifact: async ({ bytes }) => ({
        transfer_id: "xfr_test",
        digest: `sha256:${bytes.length}`,
      }),
    });

    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.slot).toBe("spec");
    expect(promoted[0]?.transfer_id).toBe("xfr_test");
    const rel = stableArtifactRelPath("run_01TEST", "intake", "spec", "hero-section.md");
    expect(promoted[0]?.path).toBe(rel);
    expect(readFileSync(join(spaceRoot, rel), "utf-8")).toBe("# Hero\n");
  });

  test("mergeArtifactsIntoExecContext and bindings expose path tokens", () => {
    const execContext = mergeArtifactsIntoExecContext(
      { input: { spec_filename: "hero-section.md" } },
      "intake",
      [
        {
          slot: "spec",
          path: ".mrmr.temp/runs/run_01TEST/steps/intake/spec/hero-section.md",
          name: "hero-section.md",
          transfer_id: "xfr_test",
        },
      ],
    );

    const bindings = buildArtifactMurrmureBindings(
      (execContext.artifacts ?? {}) as Record<string, Record<string, { path: string; transfer_id?: string }>>,
    );
    expect(bindings["step.intake.artifact.spec.path"]).toContain("hero-section.md");
    expect(bindings["step.intake.artifact.spec.transfer_id"]).toBe("xfr_test");
  });

  test("promoteArtifactsOut rejects path traversal", async () => {
    await ensureStepWorkdir(spaceRoot, "run_01TEST", "intake");
    await expect(
      promoteArtifactsOut({
        space_root: spaceRoot,
        run_id: "run_01TEST",
        step_id: "intake",
        artifacts_out: [{ slot: "spec", path: "../escape.md" }],
        artifact_slots: { spec: {} },
      }),
    ).rejects.toThrow(/escapes step workdir/);
  });
});
