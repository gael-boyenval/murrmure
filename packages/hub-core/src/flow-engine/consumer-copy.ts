import { createHash, randomBytes } from "node:crypto";
import { lstat, mkdir, realpath, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { consumerInputPath, consumerInputsDirPath, runScratchDir } from "./run-scratch-paths.js";

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
 * Resolve-path containment backstop at a consumer-copy write sink. After the
 * destination directory is created, realpath it and confirm it stays inside the
 * run scratch tree; a host-level symlink on either side is canonicalized so it
 * cannot produce a false-positive escape. This is defense in depth behind
 * `safePathSegment`: even if a caller-supplied segment ever slipped past
 * segment validation, verified bytes could not be written outside the linked
 * space root. Mirrors the containment check in `materializeConsumerCopy`.
 */
async function assertContainedInRunTree(destDir: string, runRoot: string, label: string): Promise<void> {
  let realDestDir: string;
  try {
    realDestDir = await realpath(destDir);
  } catch {
    // destDir was just created; fall back to the literal path, which is
    // constructed inside the run scratch tree.
    realDestDir = destDir;
  }
  let realRunRoot: string;
  try {
    realRunRoot = await realpath(runRoot);
  } catch {
    realRunRoot = runRoot;
  }
  const destRel = relative(realRunRoot, realDestDir);
  if (destRel === "" || destRel.startsWith("..") || isAbsolute(destRel)) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `${label} '${destDir}' resolves outside the run scratch tree`,
    );
  }
}

/**
 * Validate a single path segment that crosses a federation boundary
 * (`consumer_step`, `slot`, `producer_step`, or a reference `name`) before it
 * is joined into a consumer-copy path. Relayed reference strings are
 * caller-supplied and must never carry `..`, an absolute path, or any path
 * separator — otherwise a crafted, digest-valid reference could escape the
 * linked space root during materialization. Reject (do not silently strip) so a
 * malformed relay is a loud, typed failure rather than a quiet write to an
 * unexpected location.
 */
function safePathSegment(name: string, kind: string): string {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    isAbsolute(name)
  ) {
    throw new ArtifactMaterializationError(
      "ARTIFACT_PATH_TRAVERSAL",
      `Invalid artifact ${kind} '${name}'`,
    );
  }
  return name;
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

export interface ConsumerCollectionFileInput {
  /** Absolute path of the producer artifact (must be inside the run scratch tree). */
  source_path: string;
  /** Filename to use for the consumer copy. */
  filename: string;
  /** Optional `sha256:<hex>` to verify before copying. */
  expected_digest?: string;
}

export interface ConsumerCollectionCopyResult {
  /** Absolute path of the verified consumer input directory for the slot. */
  directory: string;
  /** Per-file verified copies, in submission order. */
  files: ConsumerCopyResult[];
}

/**
 * Materialize one verified local consumer input directory for a collection
 * slot. Every file in the ordered collection is copied atomically into
 * `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/` with its
 * normalized unique name and digest verified, so a handler receives one
 * directory whose contents equal the ordered collection manifest.
 *
 * Materialization is all-or-nothing: if any file fails (missing source,
 * traversal, digest mismatch, or copy failure), the partial slot directory is
 * removed and the error rethrown, so a handler never observes a half-populated
 * collection directory. Each file reuses `materializeConsumerCopy`'s symlink
 * containment and atomic-rename guarantees.
 */
export async function materializeConsumerCopyDirectory(input: {
  space_root: string;
  run_id: string;
  consumer_step: string;
  slot: string;
  files: ConsumerCollectionFileInput[];
}): Promise<ConsumerCollectionCopyResult> {
  const directory = consumerInputsDirPath(
    input.space_root,
    input.run_id,
    input.consumer_step,
    input.slot,
  );
  const results: ConsumerCopyResult[] = [];
  try {
    for (const file of input.files) {
      const copy = await materializeConsumerCopy({
        space_root: input.space_root,
        run_id: input.run_id,
        consumer_step: input.consumer_step,
        slot: input.slot,
        source_path: file.source_path,
        filename: file.filename,
        expected_digest: file.expected_digest,
      });
      results.push(copy);
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { directory, files: results };
}

export interface RemoteArtifactReferenceFile {
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

export interface RemoteArtifactReferenceSlot {
  producer_step: string;
  slot: string;
  cardinality: "singleton" | "collection";
  files: RemoteArtifactReferenceFile[];
}

export interface MaterializedRemoteReferenceFile {
  name: string;
  transfer_id?: string;
  digest: string;
  /** Absolute path of the verified consumer copy in the destination space. */
  path: string;
}

export interface MaterializedRemoteReferenceSlot {
  producer_step: string;
  slot: string;
  cardinality: "singleton" | "collection";
  /** Verified consumer copies in submission order (only files with local bytes). */
  files: MaterializedRemoteReferenceFile[];
  /** Absolute consumer directory for a collection slot, when materialized. */
  directory?: string;
}

/**
 * Materialize ordered remote artifact references into the destination space's
 * consumer input tree. For each collection slot, one verified directory is
 * built under `.mrmr/dev/runs/{run_id}/steps/{consumer_step}/inputs/{slot}/`
 * containing every referenced file whose bytes are local, in submission order,
 * each digest-verified and atomically renamed into place. Singletons are
 * written as a single verified copy. References whose bytes are not local are
 * skipped (returned without a `path`) so the handler can fetch them via the
 * relayed `hub_token` / `hub_url`. No producer host path is read or written.
 */
export async function materializeRemoteArtifactReferences(input: {
  space_root: string;
  run_id: string;
  consumer_step: string;
  references: RemoteArtifactReferenceSlot[];
  loadBytes: (transfer_id: string) => Promise<{ bytes: Uint8Array; digest?: string } | null>;
}): Promise<MaterializedRemoteReferenceSlot[]> {
  // The relayed `consumer_step` is a peer hub's public invoke `step_id` —
  // caller-supplied and joined directly into the consumer-copy path. Reject any
  // traversal, absolute, or separator-bearing segment before constructing any
  // path; without this a crafted relayed invoke (e.g.
  // `step_id="../../../../escape"`) could write verified bytes outside the
  // linked space root. `slot` / `producer_step` / `name` are validated
  // per-reference below, and a resolved-path containment check at the write
  // sink backstops all of them.
  const consumerStep = safePathSegment(input.consumer_step, "consumer step");
  const runRoot = runScratchDir(input.space_root, input.run_id);
  const results: MaterializedRemoteReferenceSlot[] = [];
  for (const ref of input.references) {
    // Relayed `slot` / `producer_step` / `name` strings are caller-supplied and
    // are joined directly into the consumer-copy path; reject any traversal,
    // absolute, or separator-bearing segment before constructing paths.
    const slot = safePathSegment(ref.slot, "slot");
    const producerStep = safePathSegment(ref.producer_step, "producer step");
    const directory =
      ref.cardinality === "collection"
        ? consumerInputsDirPath(input.space_root, input.run_id, consumerStep, slot)
        : undefined;
    if (directory) await mkdir(directory, { recursive: true });
    const files: MaterializedRemoteReferenceFile[] = [];
    try {
      for (const file of ref.files) {
        if (!file.transfer_id) continue;
        const loaded = await input.loadBytes(file.transfer_id);
        if (!loaded) continue;
        const bytes = Buffer.from(loaded.bytes);
        const digest = loaded.digest ?? sha256OfFile(bytes);
        if (file.digest && file.digest !== digest) {
          throw new ArtifactMaterializationError(
            "ARTIFACT_DIGEST_MISMATCH",
            `Remote artifact '${file.name}' (transfer ${file.transfer_id}) digest mismatch: expected ${file.digest}, got ${digest}`,
          );
        }
        const filename = safePathSegment(file.name, "filename");
        const dest = consumerInputPath(
          input.space_root,
          input.run_id,
          consumerStep,
          slot,
          filename,
        );
        const destDir = dirname(dest);
        await mkdir(destDir, { recursive: true });
        // Contain the destination: a pre-existing symlink anywhere in the
        // destination parent chain must not let the temp write and rename land
        // outside the run scratch tree. realpath the destination directory after
        // mkdir and confirm it stays inside the run scratch tree — a
        // defense-in-depth backstop behind the segment validation above.
        await assertContainedInRunTree(destDir, runRoot, "Remote consumer copy destination");
        // The final destination entry must be a real file written inside the
        // tree — never a pre-existing symlink that points elsewhere.
        try {
          const destStat = await lstat(dest);
          if (destStat.isSymbolicLink()) {
            throw new ArtifactMaterializationError(
              "ARTIFACT_PATH_TRAVERSAL",
              `Remote consumer copy destination '${dest}' is a symlink and cannot be overwritten`,
            );
          }
        } catch (error) {
          if (error instanceof ArtifactMaterializationError) throw error;
          // dest does not exist yet — expected on first materialization.
        }
        const tmp = join(destDir, `.tmp-${randomBytes(8).toString("hex")}`);
        try {
          await writeFile(tmp, bytes);
          await rename(tmp, dest);
        } catch (error) {
          await rm(tmp, { force: true });
          throw new ArtifactMaterializationError(
            "ARTIFACT_COPY_FAILED",
            `Failed to materialize remote artifact '${file.name}': ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        files.push({ name: filename, transfer_id: file.transfer_id, digest, path: dest });
      }
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    }
    results.push({
      producer_step: producerStep,
      slot,
      cardinality: ref.cardinality,
      files,
      directory,
    });
  }
  return results;
}
