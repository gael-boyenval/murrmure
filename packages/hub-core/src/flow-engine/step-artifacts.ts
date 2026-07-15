import { copyFile, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, relative, resolve } from "node:path";
import type { ResolveStepArtifactOut, StepArtifactSlot } from "@murrmure/contracts";
import { directoryBytes } from "./fs-bytes.js";
import { runScratchDir, spaceRunsDir, stableSlotDirRel, stepStableDirRel, stepWorkdirRel } from "./run-scratch-paths.js";

/**
 * One ordered file within a resolved step-artifact slot. `path` is the stable
 * promoted run-scratch relative path; `transfer_id`/`digest` are the global
 * immutable references registered for the file (present when the run registers
 * artifacts for federation). Remote consumers materialize from the references,
 * never from `path`.
 */
export interface ResolvedArtifactFile {
  name: string;
  path: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

/**
 * A resolved artifact slot is a bounded, ordered file collection. A singleton
 * slot (`max_files` default 1) holds exactly one file and binds via `.path`; a
 * collection slot (`max_files > 1`) holds one or more ordered files and binds
 * via `.directory`. The two token shapes are not interchangeable: apply rejects
 * a singular `.path` binding for a collection and a `.directory` binding for a
 * singleton. `cardinality` is captured at promotion time from the slot
 * definition so binding projection never needs the catalog.
 */
export interface ResolvedStepArtifact {
  slot: string;
  cardinality: "singleton" | "collection";
  files: ResolvedArtifactFile[];
}

export type RunArtifactsBag = Record<string, Record<string, ResolvedStepArtifact>>;

export const MAX_ARTIFACT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_STEP_RESOLUTION_BYTES = 50 * 1024 * 1024;
export const MAX_RUN_ARTIFACT_BYTES = 250 * 1024 * 1024;
export const MAX_SPACE_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;

export function stepStableDirRelPath(run_id: string, step_id: string): string {
  return stepStableDirRel(run_id, step_id);
}

export function stepStableDirPath(space_root: string, run_id: string, step_id: string): string {
  return join(space_root, stepStableDirRel(run_id, step_id));
}

export function stableArtifactRelPath(
  run_id: string,
  step_id: string,
  slot: string,
  filename: string,
): string {
  return join(stepStableDirRel(run_id, step_id), slot, filename);
}

/** Relative stable slot directory for a collection's `.directory` binding. */
export function stableSlotDirRelPath(
  run_id: string,
  step_id: string,
  slot: string,
): string {
  return stableSlotDirRel(run_id, step_id, slot);
}

export async function ensureStepWorkdir(
  space_root: string,
  run_id: string,
  step_id: string,
): Promise<string> {
  const dir = join(space_root, stepWorkdirRel(run_id, step_id));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeStepWorkdirFile(input: {
  space_root: string;
  run_id: string;
  step_id: string;
  filename: string;
  bytes: Buffer;
}): Promise<{ path: string; absolute_path: string }> {
  const workdir = await ensureStepWorkdir(input.space_root, input.run_id, input.step_id);
  const safeName = basename(normalize(input.filename));
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error("Invalid artifact filename");
  }
  const absolute_path = join(workdir, safeName);
  await writeFile(absolute_path, input.bytes);
  return { path: safeName, absolute_path };
}

export function validateArtifactsOut(
  artifacts_out: ResolveStepArtifactOut[] | undefined,
  declared_slots: Record<string, StepArtifactSlot> | undefined,
): string | null {
  if (!artifacts_out?.length) return null;
  if (!declared_slots || Object.keys(declared_slots).length === 0) {
    return "Step has no declared artifact_slots for artifacts_out";
  }
  for (const out of artifacts_out) {
    if (!declared_slots[out.slot]) {
      return `Unknown artifact slot '${out.slot}'`;
    }
  }
  return null;
}

export function resolveWorkdirRelativePath(workdir: string, relativePath: string): string | null {
  const normalized = normalize(relativePath).replace(/^(\.\/)+/, "");
  if (normalized === ".." || normalized.startsWith("../")) return null;
  const abs = resolve(workdir, normalized);
  const rel = relative(workdir, abs);
  if (rel.startsWith("..") || rel.includes("..")) return null;
  return abs;
}

export interface ArtifactRegisterFn {
  (input: { name: string; bytes: Buffer; slot: string }): Promise<{ transfer_id: string; digest: string }>;
}

export async function promoteArtifactsOut(input: {
  space_root: string;
  run_id: string;
  step_id: string;
  artifacts_out: ResolveStepArtifactOut[];
  artifact_slots: Record<string, StepArtifactSlot>;
  registerArtifact?: ArtifactRegisterFn;
}): Promise<ResolvedStepArtifact[]> {
  const workdir = join(input.space_root, stepWorkdirRel(input.run_id, input.step_id));
  const stableDir = stepStableDirPath(input.space_root, input.run_id, input.step_id);
  const prepared: Array<{
    out: ResolveStepArtifactOut;
    bytes: Buffer;
    filename: string;
    srcAbs: string;
  }> = [];
  const counts = new Map<string, number>();
  const totals = new Map<string, number>();
  const names = new Map<string, Set<string>>();
  let stepTotal = 0;

  for (const out of input.artifacts_out) {
    const slotDef = input.artifact_slots[out.slot];
    if (!slotDef) continue;
    const srcAbs = resolveWorkdirRelativePath(workdir, out.path);
    if (!srcAbs) {
      throw new Error(`Artifact path '${out.path}' escapes step workdir`);
    }
    const bytes = await readFile(srcAbs);
    const filename = basename(out.name ?? out.path) || out.slot;
    const normalizedName = filename.toLowerCase();
    const slotNames = names.get(out.slot) ?? new Set<string>();
    if (slotNames.has(normalizedName)) {
      throw new Error(`Artifact slot '${out.slot}' contains duplicate filename '${filename}'`);
    }
    slotNames.add(normalizedName);
    names.set(out.slot, slotNames);
    const count = (counts.get(out.slot) ?? 0) + 1;
    const total = (totals.get(out.slot) ?? 0) + bytes.length;
    counts.set(out.slot, count);
    totals.set(out.slot, total);
    stepTotal += bytes.length;

    if (bytes.length > MAX_ARTIFACT_FILE_BYTES) {
      throw new Error(`Artifact '${filename}' exceeds the 25 MiB file ceiling`);
    }
    if (slotDef.min_bytes !== undefined && bytes.length < slotDef.min_bytes) {
      throw new Error(`Artifact slot '${out.slot}' is smaller than min_bytes (${slotDef.min_bytes})`);
    }
    if (slotDef.max_bytes !== undefined && bytes.length > slotDef.max_bytes) {
      throw new Error(`Artifact slot '${out.slot}' exceeds max_bytes (${slotDef.max_bytes})`);
    }
    if (slotDef.media_types?.length && (!out.media_type || !slotDef.media_types.includes(out.media_type.toLowerCase()))) {
      throw new Error(`Artifact '${filename}' has unsupported media type '${out.media_type ?? ""}'`);
    }
    if (slotDef.extensions?.length && !slotDef.extensions.includes(extname(filename).toLowerCase())) {
      throw new Error(`Artifact '${filename}' has an unsupported extension`);
    }
    prepared.push({ out, bytes, filename, srcAbs });
  }

  if (stepTotal > MAX_STEP_RESOLUTION_BYTES) {
    throw new Error("Artifacts exceed the 50 MiB step-resolution ceiling");
  }
  const runDir = runScratchDir(input.space_root, input.run_id);
  const runStored = await directoryBytes(runDir);
  if (runStored + stepTotal > MAX_RUN_ARTIFACT_BYTES) {
    throw new Error("Artifacts exceed the 250 MiB run ceiling");
  }
  const spaceStored = await directoryBytes(spaceRunsDir(input.space_root));
  if (spaceStored + stepTotal > MAX_SPACE_ARTIFACT_BYTES) {
    throw new Error("Artifacts exceed the 2 GiB space ceiling");
  }
  for (const [slot, slotDef] of Object.entries(input.artifact_slots)) {
    const count = counts.get(slot) ?? 0;
    const total = totals.get(slot) ?? 0;
    if (slotDef.min_files !== undefined && count < slotDef.min_files) {
      throw new Error(`Artifact slot '${slot}' requires at least ${slotDef.min_files} file(s)`);
    }
    if (count > (slotDef.max_files ?? 1)) {
      throw new Error(`Artifact slot '${slot}' accepts at most ${slotDef.max_files ?? 1} file(s)`);
    }
    if (slotDef.max_total_bytes !== undefined && total > slotDef.max_total_bytes) {
      throw new Error(`Artifact slot '${slot}' exceeds max_total_bytes (${slotDef.max_total_bytes})`);
    }
  }

  await mkdir(stableDir, { recursive: true });
  // Per-slot ordered files, preserving the submission/artifacts_out order, so
  // the collection manifest stays deterministic for local and remote consumers.
  const slotFiles = new Map<string, ResolvedArtifactFile[]>();
  try {
    for (const item of prepared) {
      const slotDir = join(stableDir, item.out.slot);
      await mkdir(slotDir, { recursive: true });
      const destAbs = join(slotDir, item.filename);
      await copyFile(item.srcAbs, destAbs);
      const relPath = stableArtifactRelPath(input.run_id, input.step_id, item.out.slot, item.filename);
      let transfer_id: string | undefined;
      let digest: string | undefined;
      if (input.registerArtifact) {
        const reg = await input.registerArtifact({
          name: item.filename,
          bytes: item.bytes,
          slot: item.out.slot,
        });
        transfer_id = reg.transfer_id;
        digest = reg.digest;
      }
      const file: ResolvedArtifactFile = {
        name: item.filename,
        path: relPath,
        transfer_id,
        digest,
        size_bytes: item.bytes.length,
      };
      const list = slotFiles.get(item.out.slot) ?? [];
      list.push(file);
      slotFiles.set(item.out.slot, list);
    }
  } catch (error) {
    await rm(stableDir, { recursive: true, force: true });
    throw error;
  }
  await Promise.all(prepared.map((item) => unlink(item.srcAbs).catch(() => undefined)));
  const promoted: ResolvedStepArtifact[] = [];
  for (const [slot, files] of slotFiles) {
    const slotDef = input.artifact_slots[slot];
    const cardinality: ResolvedStepArtifact["cardinality"] =
      (slotDef?.max_files ?? 1) > 1 ? "collection" : "singleton";
    promoted.push({ slot, cardinality, files });
  }
  return promoted;
}

export function mergeArtifactsIntoExecContext(
  execContext: Record<string, unknown>,
  step_id: string,
  artifacts: ResolvedStepArtifact[],
): Record<string, unknown> {
  const bag: RunArtifactsBag = {
    ...((execContext.artifacts ?? {}) as RunArtifactsBag),
  };
  const stepBag = { ...(bag[step_id] ?? {}) };
  for (const collection of artifacts) {
    const existing = stepBag[collection.slot];
    if (existing) {
      stepBag[collection.slot] = {
        ...collection,
        files: [...existing.files, ...collection.files],
      };
    } else {
      stepBag[collection.slot] = collection;
    }
  }
  bag[step_id] = stepBag;
  return { ...execContext, artifacts: bag };
}

export function runArtifactsFromExecContext(execContext: Record<string, unknown>): RunArtifactsBag {
  return (execContext.artifacts ?? {}) as RunArtifactsBag;
}

/**
 * One ordered artifact reference for a remote/federated consumer — never a
 * local path. Mirrors `RemoteArtifactFileReference` on the wire.
 */
export interface RemoteArtifactFileReference {
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

/**
 * Ordered artifact references for one producer step + slot, for remote relay.
 * `cardinality` is carried so the remote consumer binds the correct token
 * shape without the producer's catalog.
 */
export interface RemoteArtifactSlotReference {
  producer_step: string;
  slot: string;
  cardinality: "singleton" | "collection";
  files: RemoteArtifactFileReference[];
}

/**
 * Ordered artifact references for remote/federated consumers — never local
 * paths. One entry per producer step + slot, preserving submission order.
 * Remote consumers materialize a collection directory or a singleton copy from
 * the immutable `transfer_id` / `digest` references in their own space.
 */
export function buildRemoteArtifactReferences(
  execContext: Record<string, unknown>,
): RemoteArtifactSlotReference[] {
  const artifacts = runArtifactsFromExecContext(execContext);
  const refs: RemoteArtifactSlotReference[] = [];
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      refs.push({
        producer_step: stepId,
        slot,
        cardinality: record.cardinality,
        files: record.files.map((file) => ({
          name: file.name,
          transfer_id: file.transfer_id,
          digest: file.digest,
          size_bytes: file.size_bytes,
        })),
      });
    }
  }
  return refs;
}

/**
 * Reference-only `inputs_from_run` projection for the remote boundary. Drops
 * the producer `.path` / `.directory` keys (host-relative run-scratch paths);
 * keeps ordered `.files` references and `.transfer_ids` for collections, and
 * `.transfer_id` plus `name` / `digest` / `size_bytes` for singletons. Step
 * outputs and run input values are preserved untouched.
 */
export function artifactReferencesForInputs(
  execContext: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const artifacts = runArtifactsFromExecContext(execContext);
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      if (record.cardinality === "collection") {
        merged[`steps.${stepId}.artifact.${slot}.files`] = record.files.map((file) => ({
          name: file.name,
          transfer_id: file.transfer_id,
          digest: file.digest,
          size_bytes: file.size_bytes,
        }));
        const transferIds = record.files
          .map((file) => file.transfer_id)
          .filter(Boolean) as string[];
        if (transferIds.length) {
          merged[`steps.${stepId}.artifact.${slot}.transfer_ids`] = transferIds;
        }
        continue;
      }
      const file = record.files[0];
      if (!file) continue;
      merged[`steps.${stepId}.artifact.${slot}.transfer_id`] = file.transfer_id;
      merged[`steps.${stepId}.artifact.${slot}.name`] = file.name;
      merged[`steps.${stepId}.artifact.${slot}.digest`] = file.digest;
      merged[`steps.${stepId}.artifact.${slot}.size_bytes`] = file.size_bytes;
    }
  }
  return merged;
}

/**
 * A run artifacts bag sanitized for the federation boundary: every file is a
 * reference (`name` / `transfer_id` / `digest` / `size_bytes`) with no producer
 * `path`. Mirrors `ResolvedStepArtifact` minus the host-relative `path` field.
 */
export interface RemoteResolvedArtifactFile {
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

export interface RemoteResolvedStepArtifact {
  slot: string;
  cardinality: "singleton" | "collection";
  files: RemoteResolvedArtifactFile[];
}

export type RemoteRunArtifactsBag = Record<string, Record<string, RemoteResolvedStepArtifact>>;

/**
 * Drop the local `path` field from every file in a run artifacts bag so the
 * bag can cross a federation boundary as references only. `name`,
 * `transfer_id`, `digest`, and `size_bytes` are preserved; `cardinality` and
 * `slot` are unchanged. The returned bag never carries a host or run-scratch
 * path.
 */
export function sanitizeRunArtifactsBagForRemote(bag: RunArtifactsBag): RemoteRunArtifactsBag {
  const out: RemoteRunArtifactsBag = {};
  for (const [stepId, slots] of Object.entries(bag)) {
    const slotMap: Record<string, RemoteResolvedStepArtifact> = {};
    for (const [slot, record] of Object.entries(slots)) {
      slotMap[slot] = {
        slot: record.slot,
        cardinality: record.cardinality,
        files: record.files.map((file) => ({
          name: file.name,
          transfer_id: file.transfer_id,
          digest: file.digest,
          size_bytes: file.size_bytes,
        })),
      };
    }
    out[stepId] = slotMap;
  }
  return out;
}

/**
 * Build shell prompt bindings for run artifacts. A singleton slot binds
 * `step.{step}.artifact.{slot}.path` (and `.transfer_id`); a collection slot
 * binds `step.{step}.artifact.{slot}.directory` to its stable promoted slot
 * directory. The dispatch materializer overrides these with verified consumer
 * copies at spawn time. The two token shapes are never emitted for the wrong
 * cardinality, so a handler cannot accidentally bind a collection as a path.
 */
export function buildArtifactMurrmureBindings(artifacts: RunArtifactsBag): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      if (record.cardinality === "collection") {
        const dirFile = record.files[0]?.path;
        if (dirFile) {
          bindings[`step.${stepId}.artifact.${slot}.directory`] = dirname(dirFile);
        }
        continue;
      }
      const file = record.files[0];
      if (!file) continue;
      bindings[`step.${stepId}.artifact.${slot}.path`] = file.path;
      if (file.transfer_id) {
        bindings[`step.${stepId}.artifact.${slot}.transfer_id`] = file.transfer_id;
      }
    }
  }
  return bindings;
}

/**
 * Project artifact references for `inputs_from_run` (read by agents and remote
 * consumers). A singleton projects `.path` + `.transfer_id`; a collection
 * projects `.directory` plus an ordered `.files` array of immutable references
 * (`name`, `transfer_id`, `digest`, `size_bytes`) and a `.transfer_ids` list,
 * never local paths. Remote/federated consumers materialize a collection from
 * the ordered references in their own space.
 *
 * This is the **local** projection: `.path` / `.directory` are run-scratch
 * relative paths meaningful to a local handler whose command placeholders are
 * overridden with verified consumer copies at spawn. For the federation
 * boundary use `artifactReferencesForInputs`, which drops `.path` /
 * `.directory` so no producer host path crosses the wire.
 */
export function artifactPathsForInputs(execContext: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const artifacts = runArtifactsFromExecContext(execContext);
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      if (record.cardinality === "collection") {
        const dirFile = record.files[0]?.path;
        if (dirFile) {
          merged[`steps.${stepId}.artifact.${slot}.directory`] = dirname(dirFile);
        }
        merged[`steps.${stepId}.artifact.${slot}.files`] = record.files.map((file) => ({
          name: file.name,
          transfer_id: file.transfer_id,
          digest: file.digest,
          size_bytes: file.size_bytes,
        }));
        const transferIds = record.files.map((file) => file.transfer_id).filter(Boolean) as string[];
        if (transferIds.length) {
          merged[`steps.${stepId}.artifact.${slot}.transfer_ids`] = transferIds;
        }
        continue;
      }
      const file = record.files[0];
      if (!file) continue;
      merged[`steps.${stepId}.artifact.${slot}.path`] = file.path;
      if (file.transfer_id) {
        merged[`steps.${stepId}.artifact.${slot}.transfer_id`] = file.transfer_id;
      }
    }
  }
  return merged;
}
