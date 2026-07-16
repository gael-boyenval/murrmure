import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";

export const TUTORIAL_V3_FIXTURE_ROOT = resolve(
  import.meta.dirname,
  "../spaces/tutorial-v3",
);

export type TutorialPart = 2 | 3 | 5 | 6;

interface SnapshotDocument {
  schemaVersion: 1;
  part: TutorialPart;
  extends?: string;
  files: Record<string, string | null>;
  snippets?: Record<string, string>;
}

export interface TutorialSnapshot {
  part: TutorialPart;
  source: string;
  files: Readonly<Record<string, string>>;
  snippets: Readonly<Record<string, string>>;
}

function assertSafeRelativePath(path: string): void {
  const normalized = normalize(path);
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    normalized === ".." ||
    normalized.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new Error(`Unsafe tutorial fixture path: ${path}`);
  }
}

function readDocument(path: string): SnapshotDocument {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SnapshotDocument;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported tutorial snapshot schema in ${path}`);
  }
  if (![2, 3, 5, 6].includes(parsed.part)) {
    throw new Error(`Unsupported tutorial snapshot part in ${path}`);
  }
  for (const file of Object.keys(parsed.files)) assertSafeRelativePath(file);
  return parsed;
}

function loadSnapshotFile(path: string, seen: Set<string>): TutorialSnapshot {
  const source = resolve(path);
  if (seen.has(source)) throw new Error(`Tutorial snapshot cycle at ${source}`);
  seen.add(source);

  const document = readDocument(source);
  const parent = document.extends
    ? loadSnapshotFile(resolve(dirname(source), document.extends), seen)
    : undefined;
  const files: Record<string, string> = { ...(parent?.files ?? {}) };
  const snippets: Record<string, string> = { ...(parent?.snippets ?? {}) };

  for (const [pathKey, content] of Object.entries(document.files)) {
    if (content === null) delete files[pathKey];
    else files[pathKey] = content;
  }
  Object.assign(snippets, document.snippets ?? {});
  seen.delete(source);

  return {
    part: document.part,
    source,
    files,
    snippets,
  };
}

export function tutorialSnapshotPath(part: TutorialPart): string {
  return join(TUTORIAL_V3_FIXTURE_ROOT, `part-${part}`, "snapshot.json");
}

export function loadTutorialSnapshot(part: TutorialPart): TutorialSnapshot {
  return loadSnapshotFile(tutorialSnapshotPath(part), new Set());
}

export function materializeTutorialSnapshot(
  part: TutorialPart,
  destination: string,
): TutorialSnapshot {
  const snapshot = loadTutorialSnapshot(part);
  mkdirSync(destination, { recursive: true });
  for (const [relativePath, content] of Object.entries(snapshot.files)) {
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }
  return snapshot;
}

export function resetMaterializedTutorialSnapshot(
  part: TutorialPart,
  destination: string,
): TutorialSnapshot {
  rmSync(destination, { recursive: true, force: true });
  return materializeTutorialSnapshot(part, destination);
}

