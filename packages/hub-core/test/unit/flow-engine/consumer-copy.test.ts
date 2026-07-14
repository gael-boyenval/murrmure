import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  ArtifactMaterializationError,
  materializeConsumerCopy,
} from "../../../src/flow-engine/consumer-copy.js";

function sha256(text: string): string {
  return "sha256:" + createHash("sha256").update(text).digest("hex");
}

describe("materializeConsumerCopy", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-cc-"));
  });

  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  function makeProducer(runId: string, step: string, slot: string, name: string, content: string) {
    const rel = join(".mrmr", "dev", "runs", runId, "steps", step, slot, name);
    const abs = join(spaceRoot, rel);
    mkdirSync(join(spaceRoot, ".mrmr", "dev", "runs", runId, "steps", step, slot), {
      recursive: true,
    });
    writeFileSync(abs, content);
    return { rel, abs, digest: sha256(content) };
  }

  test("materializes a verified copy under inputs/{slot}/{name} and leaves the source untouched", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "# spec\n");
    const result = await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "write_spec",
      slot: "spec",
      source_path: producer.abs,
      filename: "spec.md",
      expected_digest: producer.digest,
    });

    const expected = join(
      spaceRoot,
      ".mrmr",
      "dev",
      "runs",
      "run_demo",
      "steps",
      "write_spec",
      "inputs",
      "spec",
      "spec.md",
    );
    expect(result.path).toBe(expected);
    expect(result.digest).toBe(producer.digest);
    expect(result.size_bytes).toBe("# spec\n".length);
    expect(existsSync(expected)).toBe(true);
    // Source is never mutated.
    expect(statSync(producer.abs).size).toBe("# spec\n".length);
  });

  test("rejects a source that escapes the run scratch tree (traversal)", async () => {
    const outside = join(spaceRoot, "outside.md");
    writeFileSync(outside, "secret");
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: outside,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("rejects a missing source file", async () => {
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "missing.md"),
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_SOURCE_NOT_FOUND" });
  });

  test("rejects a non-file source (directory)", async () => {
    const dir = join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "intake", "spec");
    mkdirSync(dir, { recursive: true });
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: dir,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_SOURCE_NOT_FILE" });
  });

  test("rejects a digest mismatch and writes no consumer bytes", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "real content");
    const dest = join(
      spaceRoot,
      ".mrmr",
      "dev",
      "runs",
      "run_demo",
      "steps",
      "write_spec",
      "inputs",
      "spec",
      "spec.md",
    );
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: producer.abs,
        filename: "spec.md",
        expected_digest: "sha256:deadbeef",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_DIGEST_MISMATCH" });
    expect(existsSync(dest)).toBe(false);
  });

  test("overwrites a previously materialized consumer copy atomically", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "first");
    await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "write_spec",
      slot: "spec",
      source_path: producer.abs,
      filename: "spec.md",
    });
    writeFileSync(producer.abs, "second");
    const result = await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "write_spec",
      slot: "spec",
      source_path: producer.abs,
      filename: "spec.md",
    });
    expect(result.digest).toBe(sha256("second"));
  });

  test("neutralizes a traversal filename via basename", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "x");
    const result = await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "write_spec",
      slot: "spec",
      source_path: producer.abs,
      filename: "../escape.md",
    });
    expect(result.path.endsWith(join("inputs", "spec", "escape.md"))).toBe(true);
    expect(result.path).not.toContain("..");
  });
});
