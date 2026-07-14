import { copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize, relative, resolve } from "node:path";
import type { ResolveStepArtifactOut, StepArtifactSlot } from "@murrmure/contracts";
import { runScratchDir, stepStableDirRel, stepWorkdirRel } from "./run-scratch-paths.js";

export interface ResolvedStepArtifact {
  slot: string;
  path: string;
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
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
  const spaceStored = await directoryBytes(join(input.space_root, ".mrmr", "dev", "runs"));
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
  const promoted: ResolvedStepArtifact[] = [];
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
      promoted.push({
        slot: item.out.slot,
        path: relPath,
        name: item.filename,
        transfer_id,
        digest,
        size_bytes: item.bytes.length,
      });
    }
  } catch (error) {
    await rm(stableDir, { recursive: true, force: true });
    throw error;
  }
  await Promise.all(prepared.map((item) => unlink(item.srcAbs).catch(() => undefined)));
  return promoted;
}

async function directoryBytes(path: string): Promise<number> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
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
  for (const artifact of artifacts) {
    stepBag[artifact.slot] = artifact;
  }
  bag[step_id] = stepBag;
  return { ...execContext, artifacts: bag };
}

export function runArtifactsFromExecContext(execContext: Record<string, unknown>): RunArtifactsBag {
  return (execContext.artifacts ?? {}) as RunArtifactsBag;
}

export function buildArtifactMurrmureBindings(artifacts: RunArtifactsBag): Record<string, string> {
  const bindings: Record<string, string> = {};
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      bindings[`step.${stepId}.artifact.${slot}.path`] = record.path;
      if (record.transfer_id) {
        bindings[`step.${stepId}.artifact.${slot}.transfer_id`] = record.transfer_id;
      }
    }
  }
  return bindings;
}

export function artifactPathsForInputs(execContext: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const artifacts = runArtifactsFromExecContext(execContext);
  for (const [stepId, slots] of Object.entries(artifacts)) {
    for (const [slot, record] of Object.entries(slots)) {
      merged[`steps.${stepId}.artifact.${slot}.path`] = record.path;
      if (record.transfer_id) {
        merged[`steps.${stepId}.artifact.${slot}.transfer_id`] = record.transfer_id;
      }
    }
  }
  return merged;
}
