import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, realpath, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
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
 * (`.mrmr/dev/runs/{run_id}/…`). Symlinked sources and symlinked parent
 * directories that resolve outside the run scratch tree are rejected as
 * traversal (`ARTIFACT_PATH_TRAVERSAL`): the source entry is `lstat`-checked
 * for a real file, then `realpath`-resolved and containment-verified. The
 * source is read once and never mutated — only a copy is written. When
 * `expected_digest` is supplied, the source digest must match or the copy is
 * refused (`ARTIFACT_DIGEST_MISMATCH`) before any consumer bytes are written.
 *
 * The copy is written to a temporary sibling under the consumer `inputs/{slot}`
 * directory and atomically renamed into place (POSIX rename atomically replaces
 * any existing destination), so a partially-written file is never observable
 * and a prior copy is never left missing. A failed copy removes its temporary
 * bytes.
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
  // Cheap literal containment check first; the realpath check below is the
  // authoritative guard against symlinked parent directories.
  const literalRel = relative(runRoot, input.source_path);
  if (literalRel.startsWith("..") || literalRel === "") {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Artifact source '${input.source_path}' escapes the run scratch tree`,
    );
  }

  // The source entry itself must be a real regular file — never a symlink that
  // could point outside the run scratch tree.
  let srcStat;
  try {
    srcStat = await lstat(input.source_path);
  } catch {
    throw new ArtifactMaterializationError(
      "ARTIFACT_SOURCE_NOT_FOUND",
      `Artifact source '${input.source_path}' not found`,
    );
  }
  if (srcStat.isSymbolicLink()) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Artifact source '${input.source_path}' is a symlink and cannot be copied`,
    );
  }
  if (!srcStat.isFile()) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_SOURCE_NOT_FILE",
      `Artifact source '${input.source_path}' is not a regular file`,
    );
  }

  // Resolve symlinked parent directories and confirm the real path stays inside
  // the run scratch tree (prevents an in-tree symlink to an outside file). Both
  // sides are realpath-canonicalized so a host-level symlink on the space root
  // (e.g. macOS `/var` → `/private/var`) cannot produce a false-positive escape.
  let realSource: string;
  try {
    realSource = await realpath(input.source_path);
  } catch {
    throw new ArtifactMaterializationError(
      "ARTIFACT_SOURCE_NOT_FOUND",
      `Artifact source '${input.source_path}' not found`,
    );
  }
  let realRunRoot: string;
  try {
    realRunRoot = await realpath(runRoot);
  } catch {
    // runRoot is not present on disk — fall back to the literal root, which the
    // literal containment check above already validated. (This cannot occur when
    // the source file inside it was just lstat'd successfully.)
    realRunRoot = runRoot;
  }
  const realRel = relative(realRunRoot, realSource);
  if (realRel === "" || realRel.startsWith("..") || isAbsolute(realRel)) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Artifact source '${input.source_path}' resolves outside the run scratch tree`,
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

  // Contain the destination: a pre-existing symlink anywhere in the destination
  // parent chain (e.g. `.../inputs/{slot}` → an outside directory) must not let
  // the temp write and rename land outside the run scratch tree. realpath the
  // destination directory after mkdir and confirm it stays inside the run
  // scratch tree, canonicalizing against the same realRunRoot used for the
  // source so a host-level symlink cannot produce a false-positive escape.
  let realDestDir: string;
  try {
    realDestDir = await realpath(destDir);
  } catch {
    // destDir was just created; fall back to the literal path, which is
    // constructed inside the run scratch tree.
    realDestDir = destDir;
  }
  const destRel = relative(realRunRoot, realDestDir);
  if (destRel === "" || destRel.startsWith("..") || isAbsolute(destRel)) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Consumer copy destination '${destDir}' resolves outside the run scratch tree`,
    );
  }

  // The final destination entry must be a real file written inside the tree —
  // never a pre-existing symlink that points elsewhere.
  try {
    const destStat = await lstat(dest);
    if (destStat.isSymbolicLink()) {
      throw new ArtifactMaterializationError(
        "ARTIFACT_PATH_TRAVERSAL",
        `Consumer copy destination '${dest}' is a symlink and cannot be overwritten`,
      );
    }
  } catch (error) {
    if (error instanceof ArtifactMaterializationError) throw error;
    // dest does not exist yet — expected on first materialization.
  }

  // Read the real source once to compute the digest; keep the buffer for the
  // copy so the source is touched exactly once and remains immutable.
  const buffer = await readFile(realSource);
  const digest = sha256OfFile(buffer);
  if (input.expected_digest && input.expected_digest !== digest) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_DIGEST_MISMATCH",
      `Artifact digest mismatch for '${filename}': expected ${input.expected_digest}, got ${digest}`,
    );
  }

  // Write to a temp sibling and atomically rename into place. POSIX rename
  // atomically replaces an existing destination, so a partial file is never
  // observable and a prior copy is never left missing.
  const tmp = join(destDir, `.tmp-${randomBytes(8).toString("hex")}`);
  try {
    await writeFile(tmp, buffer);
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
