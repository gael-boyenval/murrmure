import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { runScratchDir, consumerInputPath } from "./run-scratch-paths.js";

export interface ConsumerCopyResult {
  /** Absolute path of the verified consumer copy. */
  path: string;
  /** `sha256:<hex>` of the copied bytes. */
  digest: string;
  size_bytes: number;
}

export class ArtifactMaterializationError extends Error {
  constructor(
    public readonly code:
      | "ARTIFACT_SOURCE_NOT_FOUND"
      | "ARTIFACT_SOURCE_NOT_FILE"
      | "ARTIFACT_PATH_TRAVERSAL"
      | "ARTIFACT_DIGEST_MISMATCH"
      | "ARTIFACT_COPY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ArtifactMaterializationError";
  }
}

function sha256OfFile(buffer: Buffer): string {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function safeFilename(name: string): string {
  const base = basename(name);
  if (!base || base === "." || base === "..") {
    throw new ArtifactMaterializationError("ARTIFACT_PATH_TRAVERSAL", `Invalid artifact filename '${name}'`);
  }
  return base;
}

/**
 * Materialize one verified local consumer copy of a run-scoped artifact.
 *
 * The source must be a regular file inside the run's scratch tree
 * (`.mrmr/dev/runs/{run_id}/…`); paths that escape that tree are rejected as
 * traversal. The source is read once and never mutated — only a copy is
 * written. When `expected_digest` is supplied, the source digest must match or
 * the copy is refused (`ARTIFACT_DIGEST_MISMATCH`) before any consumer bytes
 * are written.
 *
 * The copy is written to a temporary sibling under the consumer `inputs/{slot}`
 * directory and atomically renamed into place, so a partially-written file is
 * never observable. A failed copy removes its temporary bytes.
 */
export async function materializeConsumerCopy(input: {
  space_root: string;
  run_id: string;
  consumer_step: string;
  slot: string;
  /** Absolute path of the producer artifact (must be inside the run scratch tree). */
  source_path: string;
  /** Filename to use for the consumer copy. */
  filename: string;
  /** Optional `sha256:<hex>` to verify before copying. */
  expected_digest?: string;
}): Promise<ConsumerCopyResult> {
  const runRoot = runScratchDir(input.space_root, input.run_id);
  const rel = relative(runRoot, input.source_path);
  if (rel.startsWith("..") || rel === "" ) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Artifact source '${input.source_path}' escapes the run scratch tree`,
    );
  }

  let srcStat;
  try {
    srcStat = await stat(input.source_path);
  } catch {
    throw new ArtifactMaterializationError(
      "ARTIFACT_SOURCE_NOT_FOUND",
      `Artifact source '${input.source_path}' not found`,
    );
  }
  if (!srcStat.isFile()) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_SOURCE_NOT_FILE",
      `Artifact source '${input.source_path}' is not a regular file`,
    );
  }

  const filename = safeFilename(input.filename);
  const dest = consumerInputPath(
    input.space_root,
    input.run_id,
    input.consumer_step,
    input.slot,
    filename,
  );
  const destDir = dirname(dest);
  await mkdir(destDir, { recursive: true });

  // Read source once to compute the digest; keep the buffer for the copy so the
  // source is touched exactly once and remains immutable.
  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(input.source_path);
  const digest = sha256OfFile(buffer);
  if (input.expected_digest && input.expected_digest !== digest) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_DIGEST_MISMATCH",
      `Artifact digest mismatch for '${filename}': expected ${input.expected_digest}, got ${digest}`,
    );
  }

  const tmp = join(destDir, `.tmp-${randomBytes(8).toString("hex")}`);
  try {
    await copyFileFromBuffer(buffer, tmp);
    await unlinkIfExists(dest);
    await rename(tmp, dest);
  } catch (error) {
    await rm(tmp, { force: true });
    throw new ArtifactMaterializationError(
      "ARTIFACT_COPY_FAILED",
      `Failed to materialize consumer copy for '${filename}': ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return { path: dest, digest, size_bytes: buffer.length };
}

async function copyFileFromBuffer(buffer: Buffer, dest: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, buffer);
}

async function rename(from: string, to: string): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.rename(from, to);
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}
