import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, normalize, relative, resolve } from "node:path";
import type { ResolveStepArtifactOut, StepArtifactSlot } from "@murrmure/contracts";
import { prefixedRunId, stepWorkdirPath } from "./step-contract-slice.js";

export interface ResolvedStepArtifact {
  slot: string;
  path: string;
  name: string;
  transfer_id?: string;
  digest?: string;
  size_bytes?: number;
}

export type RunArtifactsBag = Record<string, Record<string, ResolvedStepArtifact>>;

export function stepStableDirRelPath(run_id: string, step_id: string): string {
  return join(".mrmr", "dev", "runs", prefixedRunId(run_id), "steps", step_id);
}

export function stepStableDirPath(space_root: string, run_id: string, step_id: string): string {
  return join(space_root, stepStableDirRelPath(run_id, step_id));
}

export function stableArtifactRelPath(
  run_id: string,
  step_id: string,
  slot: string,
  filename: string,
): string {
  return join(stepStableDirRelPath(run_id, step_id), slot, filename);
}

export async function ensureStepWorkdir(
  space_root: string,
  run_id: string,
  step_id: string,
): Promise<string> {
  const dir = stepWorkdirPath(space_root, run_id, step_id);
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
  const workdir = stepWorkdirPath(input.space_root, input.run_id, input.step_id);
  const stableDir = stepStableDirPath(input.space_root, input.run_id, input.step_id);
  await mkdir(stableDir, { recursive: true });

  const promoted: ResolvedStepArtifact[] = [];

  for (const out of input.artifacts_out) {
    const slotDef = input.artifact_slots[out.slot];
    if (!slotDef) continue;

    const srcAbs = resolveWorkdirRelativePath(workdir, out.path);
    if (!srcAbs) {
      throw new Error(`Artifact path '${out.path}' escapes step workdir`);
    }

    const bytes = await readFile(srcAbs);
    if (slotDef.max_bytes && bytes.length > slotDef.max_bytes) {
      throw new Error(`Artifact slot '${out.slot}' exceeds max_bytes (${slotDef.max_bytes})`);
    }

    const filename = basename(out.path) || out.slot;
    const slotDir = join(stableDir, out.slot);
    await mkdir(slotDir, { recursive: true });
    const destAbs = join(slotDir, filename);
    await copyFile(srcAbs, destAbs);

    const relPath = stableArtifactRelPath(input.run_id, input.step_id, out.slot, filename);

    let transfer_id: string | undefined;
    let digest: string | undefined;
    if (input.registerArtifact) {
      const reg = await input.registerArtifact({ name: filename, bytes, slot: out.slot });
      transfer_id = reg.transfer_id;
      digest = reg.digest;
    }

    promoted.push({
      slot: out.slot,
      path: relPath,
      name: filename,
      transfer_id,
      digest,
      size_bytes: bytes.length,
    });
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
