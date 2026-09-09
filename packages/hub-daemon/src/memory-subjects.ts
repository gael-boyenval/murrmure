import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { Space, SpaceBinding } from "@murrmure/contracts";
import { isLocalSpaceBinding } from "@murrmure/contracts";

export const DEFAULT_MEMORY_SUBJECTS_REL = "skills/memory-use/subjects.yaml";

export const MEMORY_SUBJECTS_DEFAULTS = [
  DEFAULT_MEMORY_SUBJECTS_REL,
  ".agents/skills/memory-use/subjects.yaml",
  ".cursor/skills/memory-use/subjects.yaml",
] as const;

export function localSpaceRoot(bindings: SpaceBinding[]): string | null {
  const local = bindings.find(isLocalSpaceBinding);
  if (!local?.path) return null;
  return isAbsolute(local.path) ? local.path : resolve(local.path);
}

export function resolveDeclaredSubjectsPath(spaceRoot: string, relative: string): string {
  return resolve(join(spaceRoot, relative));
}

export function findDefaultSubjectsPath(spaceRoot: string): string | null {
  for (const rel of MEMORY_SUBJECTS_DEFAULTS) {
    const abs = resolve(join(spaceRoot, rel));
    if (existsSync(abs)) return abs;
  }
  return null;
}

/** Handbook names for MCP discovery. Does not import the memory package. */
export function readSubjectNames(path: string): string[] {
  if (!existsSync(path)) return [];
  const names: string[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*name:\s*(.+?)\s*$/);
    if (!match?.[1]) continue;
    const name = match[1].replace(/^['"]|['"]$/g, "").trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export async function resolveMemorySubjectsPath(options: {
  env?: NodeJS.ProcessEnv;
  spaces: Space[];
  bindingsFor: (spaceId: string) => Promise<SpaceBinding[]>;
}): Promise<string | null> {
  const envPath = options.env?.MURRMURE_MEMORY_SUBJECTS?.trim();
  if (envPath) {
    return isAbsolute(envPath) ? envPath : resolve(envPath);
  }

  for (const space of options.spaces) {
    const bindings = await options.bindingsFor(space.space_id);
    const root = localSpaceRoot(bindings);
    if (!root) continue;
    if (space.memory_subjects) {
      const abs = resolveDeclaredSubjectsPath(root, space.memory_subjects);
      if (existsSync(abs)) return abs;
      continue;
    }
    const found = findDefaultSubjectsPath(root);
    if (found) return found;
  }

  return null;
}
