import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  consumerInputPath,
  consumerInputsDirPath,
  runScratchDir,
  runScratchPaths,
  runScratchRelPath,
  spaceRunsDir,
  stableSlotDirRel,
  stepInputsDirRel,
  stepStableDirRel,
} from "../../../src/flow-engine/run-scratch-paths.js";
import { directoryBytes } from "../../../src/flow-engine/fs-bytes.js";
import { materializeConsumerCopy, materializeConsumerCopyDirectory } from "../../../src/flow-engine/consumer-copy.js";

describe("flow-engine/run-scratch — concurrent-run isolation", () => {
  const spaceRoot = "/tmp/space";

  test("two run ids never overlap any scratch, transfer, artifact, or output path", () => {
    const a = runScratchPaths(spaceRoot, "run_AAAA", "build");
    const b = runScratchPaths(spaceRoot, "run_BBBB", "build");
    const allPaths = (p: ReturnType<typeof runScratchPaths>) =>
      [p.run_dir, p.active_contract_path, p.workdir, p.stable_dir, p.inputs_dir].filter(
        Boolean,
      ) as string[];
    const aPaths = allPaths(a);
    const bPaths = allPaths(b);
    for (const pa of aPaths) {
      for (const pb of bPaths) {
        expect(pa).not.toBe(pb);
        // No A path is a prefix of a B path (disjoint trees).
        expect(pb.startsWith(pa)).toBe(false);
        expect(pa.startsWith(pb)).toBe(false);
      }
    }
    // Slot, inputs, and consumer copy paths are also run-disjoint.
    expect(stableSlotDirRel("run_AAAA", "build", "assets")).not.toBe(
      stableSlotDirRel("run_BBBB", "build", "assets"),
    );
    expect(stepInputsDirRel("run_AAAA", "build")).not.toBe(stepInputsDirRel("run_BBBB", "build"));
    expect(consumerInputPath(spaceRoot, "run_AAAA", "build", "assets", "a.json")).not.toBe(
      consumerInputPath(spaceRoot, "run_BBBB", "build", "assets", "a.json"),
    );
  });

  test("every run-scoped path includes the run id segment", () => {
    const rel = runScratchRelPath("run_ZZZ");
    expect(rel).toContain(join(".mrmr", "dev", "runs", "run_ZZZ"));
    expect(stepStableDirRel("run_ZZZ", "build")).toContain("run_ZZZ");
    expect(stableSlotDirRel("run_ZZZ", "build", "assets")).toContain("run_ZZZ");
    expect(stepInputsDirRel("run_ZZZ", "build")).toContain("run_ZZZ");
  });
});

describe("flow-engine/run-scratch — quota accounting includes consumer copies", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "run-quota-"));
  });
  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  test("promoted artifact and consumer copy bytes both count toward run and space quota", async () => {
    // Promoted producer artifact bytes under run_A's stable slot.
    const prodRel = join(".mrmr", "dev", "runs", "run_A", "steps", "intake", "spec", "spec.md");
    const prodAbs = join(spaceRoot, prodRel);
    mkdirSync(join(spaceRoot, dirname(prodRel)), { recursive: true });
    writeFileSync(prodAbs, Buffer.alloc(512, 0x61));

    // Consumer copy bytes under run_A's consumer step inputs.
    await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "run_A",
      consumer_step: "build",
      slot: "spec",
      source_path: prodAbs,
      filename: "spec.md",
    });

    const runBytes = await directoryBytes(runScratchDir(spaceRoot, "run_A"));
    const spaceBytes = await directoryBytes(spaceRunsDir(spaceRoot));
    // Promoted (512) + consumer copy (512) both count at the run level.
    expect(runBytes).toBeGreaterThanOrEqual(1024);
    // And roll up to the per-space runs root.
    expect(spaceBytes).toBeGreaterThanOrEqual(1024);
  });

  test("a collection consumer directory counts toward run and space quota", async () => {
    const files = ["01-a.json", "02-b.json"];
    const fileRecords = files.map((name) => {
      const rel = join(".mrmr", "dev", "runs", "run_B", "steps", "intake", "assets", name);
      const abs = join(spaceRoot, rel);
      mkdirSync(join(spaceRoot, dirname(rel)), { recursive: true });
      writeFileSync(abs, Buffer.alloc(256, 0x62));
      return { source_path: abs, filename: name };
    });
    await materializeConsumerCopyDirectory({
      space_root: spaceRoot,
      run_id: "run_B",
      consumer_step: "build",
      slot: "assets",
      files: fileRecords,
    });
    const runBytes = await directoryBytes(runScratchDir(spaceRoot, "run_B"));
    const spaceBytes = await directoryBytes(spaceRunsDir(spaceRoot));
    // Two promoted (512) + two consumer copies (512) = 1024 at run level.
    expect(runBytes).toBeGreaterThanOrEqual(1024);
    expect(spaceBytes).toBeGreaterThanOrEqual(1024);
    // The consumer directory lives under the consumer step inputs tree.
    expect(consumerInputsDirPath(spaceRoot, "run_B", "build", "assets")).toContain(
      join("run_B", "steps", "build", "inputs", "assets"),
    );
  });
});
