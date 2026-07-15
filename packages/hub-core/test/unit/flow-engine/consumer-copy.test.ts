import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  ArtifactMaterializationError,
  materializeConsumerCopy,
  materializeRemoteArtifactReferences,
  type RemoteArtifactReferenceSlot,
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

  test("rejects a symlink source as traversal", async () => {
    const outside = join(spaceRoot, "outside.md");
    writeFileSync(outside, "secret");
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "cover");
    const linkPath = join(dirname(producer.abs), "link.md");
    symlinkSync(outside, linkPath);
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: linkPath,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("rejects an in-tree symlink that resolves outside the run scratch tree", async () => {
    const outside = join(spaceRoot, "outside.md");
    writeFileSync(outside, "secret");
    // Place a symlink inside the producer slot pointing to an outside file.
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "cover");
    const linkPath = join(dirname(producer.abs), "leak.md");
    symlinkSync(outside, linkPath, "file");
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: linkPath,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("follows a symlinked parent directory and rejects when it resolves outside the run tree", async () => {
    const outside = join(spaceRoot, "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "spec.md"), "secret");
    // Create the real producer location, then replace its slot directory with a
    // symlink to an outside directory containing a spec.md.
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "cover");
    const slotDir = dirname(producer.abs);
    rmSync(slotDir, { recursive: true, force: true });
    symlinkSync(outside, slotDir, "dir");
    const linkedSource = join(slotDir, "spec.md");
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: linkedSource,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("rejects a destination parent symlink that resolves outside the run scratch tree", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "content");
    // Pre-create the consumer inputs/{slot} directory as a symlink to an
    // outside directory, so a naive temp-write + rename would land outside.
    const outside = join(spaceRoot, "outside-slot");
    mkdirSync(outside, { recursive: true });
    const slotDir = join(
      spaceRoot,
      ".mrmr",
      "dev",
      "runs",
      "run_demo",
      "steps",
      "write_spec",
      "inputs",
      "spec",
    );
    mkdirSync(dirname(slotDir), { recursive: true });
    symlinkSync(outside, slotDir, "dir");

    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: producer.abs,
        filename: "spec.md",
        expected_digest: producer.digest,
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
    // The outside directory never receives the consumer copy.
    expect(existsSync(join(outside, "spec.md"))).toBe(false);
  });

  test("rejects a pre-existing symlink at the destination filename", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "content");
    const outside = join(spaceRoot, "outside-file.md");
    writeFileSync(outside, "secret");
    const destDir = join(
      spaceRoot,
      ".mrmr",
      "dev",
      "runs",
      "run_demo",
      "steps",
      "write_spec",
      "inputs",
      "spec",
    );
    mkdirSync(destDir, { recursive: true });
    symlinkSync(outside, join(destDir, "spec.md"), "file");

    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: producer.abs,
        filename: "spec.md",
        expected_digest: producer.digest,
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
    // The outside file is untouched.
    expect(readFileSync(outside, "utf8")).toBe("secret");
  });

  test("leaves a prior copy intact when a re-copy fails (no partial overwrite)", async () => {
    const producer = makeProducer("run_demo", "intake", "spec", "spec.md", "first");
    const first = await materializeConsumerCopy({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "write_spec",
      slot: "spec",
      source_path: producer.abs,
      filename: "spec.md",
    });
    // Make the source disappear so the re-copy fails at read time; the prior
    // atomic copy must remain fully present, never partially overwritten.
    rmSync(producer.abs, { force: true });
    await expect(
      materializeConsumerCopy({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "write_spec",
        slot: "spec",
        source_path: producer.abs,
        filename: "spec.md",
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_SOURCE_NOT_FOUND" });
    expect(existsSync(first.path)).toBe(true);
    expect(statSync(first.path).size).toBe("first".length);
    expect(existsSync(join(dirname(first.path), ".tmp-"))).toBe(false);
  });
});

describe("materializeRemoteArtifactReferences — relayed name/slot traversal hardening", () => {
  let spaceRoot: string;

  beforeEach(() => {
    spaceRoot = mkdtempSync(join(tmpdir(), "murrmure-rr-"));
  });

  afterEach(() => {
    rmSync(spaceRoot, { recursive: true, force: true });
  });

  function bytesFor(content: string) {
    const bytes = new TextEncoder().encode(content);
    return { bytes, digest: sha256(content) };
  }

  function slotRef(over: Partial<RemoteArtifactReferenceSlot> & { files: { name: string; transfer_id: string; digest?: string }[] }): RemoteArtifactReferenceSlot {
    return {
      producer_step: over.producer_step ?? "intake",
      slot: over.slot ?? "assets",
      cardinality: over.cardinality ?? "collection",
      files: over.files,
    };
  }

  test("materializes valid relayed references under the consumer inputs tree", async () => {
    const result = await materializeRemoteArtifactReferences({
      space_root: spaceRoot,
      run_id: "demo",
      consumer_step: "build",
      references: [
        slotRef({
          files: [
            { name: "01-openapi.json", transfer_id: "xfr_1", digest: bytesFor("a").digest },
            { name: "02-paths.json", transfer_id: "xfr_2", digest: bytesFor("b").digest },
          ],
        }),
      ],
      loadBytes: async (tid) => (tid === "xfr_1" ? bytesFor("a") : tid === "xfr_2" ? bytesFor("b") : null),
    });
    expect(result).toHaveLength(1);
    expect(result[0].files.map((f) => f.name)).toEqual(["01-openapi.json", "02-paths.json"]);
    for (const f of result[0].files) {
      expect(existsSync(f.path)).toBe(true);
      expect(f.path).toContain(join(".mrmr", "dev", "runs", "run_demo", "steps", "build", "inputs", "assets"));
    }
  });

  test("rejects a relayed filename with `..` traversal and writes no file", async () => {
    const escapeName = "../../../../../../escape.txt";
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            cardinality: "singleton",
            files: [{ name: escapeName, transfer_id: "xfr_1", digest: bytesFor("x").digest }],
          }),
        ],
        loadBytes: async () => bytesFor("x"),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
    // Nothing escaped the space root.
    expect(existsSync(join(spaceRoot, "escape.txt"))).toBe(false);
    expect(existsSync(join(dirname(spaceRoot), "escape.txt"))).toBe(false);
  });

  test("rejects an absolute relayed filename", async () => {
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            cardinality: "singleton",
            files: [{ name: "/etc/passwd", transfer_id: "xfr_1", digest: bytesFor("x").digest }],
          }),
        ],
        loadBytes: async () => bytesFor("x"),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("rejects a relayed filename containing a path separator", async () => {
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            files: [{ name: "sub/dir.txt", transfer_id: "xfr_1", digest: bytesFor("x").digest }],
          }),
        ],
        loadBytes: async () => bytesFor("x"),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("rejects a relayed slot with `..` traversal before creating any directory", async () => {
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            slot: "../escape",
            files: [{ name: "ok.txt", transfer_id: "xfr_1", digest: bytesFor("x").digest }],
          }),
        ],
        loadBytes: async () => bytesFor("x"),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
    expect(existsSync(join(spaceRoot, "escape"))).toBe(false);
  });

  test("rejects a relayed producer_step with a path separator", async () => {
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            producer_step: "../escape",
            files: [{ name: "ok.txt", transfer_id: "xfr_1", digest: bytesFor("x").digest }],
          }),
        ],
        loadBytes: async () => bytesFor("x"),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
  });

  test("cleans a partial collection directory when a later file name is rejected", async () => {
    await expect(
      materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "demo",
        consumer_step: "build",
        references: [
          slotRef({
            files: [
              { name: "01-ok.json", transfer_id: "xfr_1", digest: bytesFor("a").digest },
              { name: "../escape.txt", transfer_id: "xfr_2", digest: bytesFor("b").digest },
            ],
          }),
        ],
        loadBytes: async (tid) => (tid === "xfr_1" ? bytesFor("a") : bytesFor("b")),
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_PATH_TRAVERSAL" });
    // The collection slot directory was removed on the all-or-nothing failure.
    const slotDir = join(spaceRoot, ".mrmr", "dev", "runs", "run_demo", "steps", "build", "inputs", "assets");
    expect(existsSync(slotDir)).toBe(false);
    expect(existsSync(join(spaceRoot, "escape.txt"))).toBe(false);
  });
});
