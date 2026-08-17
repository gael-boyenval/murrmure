import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  TUTORIAL_MEETINGS_FIXTURE_ROOT,
  loadTutorialMeetingsSnapshot,
  type TutorialMeetingsPart,
} from "../../../../test-utils/tutorial-meetings/snapshots.js";

export type FenceComparison = "yaml" | "json" | "exact";

export interface TutorialMeetingsFenceRegistration {
  id: string;
  page: string;
  part: TutorialMeetingsPart;
  snippet?: string;
  file?: string;
  compare: FenceComparison;
}

export interface TutorialMeetingsFenceRegistry {
  schemaVersion: 1;
  pages: string[];
  fences: TutorialMeetingsFenceRegistration[];
}

export interface ExtractedTutorialFence {
  id: string;
  language: string;
  content: string;
}

const FENCE_PATTERN =
  /<!-- tutorial-meetings-fence:([a-z0-9][a-z0-9-]*) -->[ \t]*\r?\n[ \t]*```([^\r\n]*)\r?\n([\s\S]*?)\r?\n```/g;

export const TUTORIAL_MEETINGS_REGISTRY_PATH = join(
  TUTORIAL_MEETINGS_FIXTURE_ROOT,
  "fences.json",
);

export function readTutorialMeetingsFenceRegistry(): TutorialMeetingsFenceRegistry {
  const parsed = JSON.parse(
    readFileSync(TUTORIAL_MEETINGS_REGISTRY_PATH, "utf8"),
  ) as TutorialMeetingsFenceRegistry;
  if (parsed.schemaVersion !== 1) {
    throw new Error("Unsupported Tutorial meetings fence registry");
  }
  return parsed;
}

export function extractTutorialMeetingsFences(
  markdown: string,
): ExtractedTutorialFence[] {
  const fences: ExtractedTutorialFence[] = [];
  for (const match of markdown.matchAll(FENCE_PATTERN)) {
    fences.push({
      id: match[1],
      language: match[2].trim(),
      content: `${match[3]}\n`,
    });
  }
  return fences;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function compareTutorialMeetingsFence(
  actual: string,
  expected: string,
  comparison: FenceComparison,
): boolean {
  if (comparison === "exact") return actual === expected;
  try {
    const actualValue =
      comparison === "yaml" ? parseYaml(actual) : JSON.parse(actual);
    const expectedValue =
      comparison === "yaml" ? parseYaml(expected) : JSON.parse(expected);
    return (
      JSON.stringify(canonicalize(actualValue)) ===
      JSON.stringify(canonicalize(expectedValue))
    );
  } catch {
    return false;
  }
}

export function verifyTutorialMeetingsDocs(
  repoRoot: string,
  registry: TutorialMeetingsFenceRegistry = readTutorialMeetingsFenceRegistry(),
  snapshotLoader = loadTutorialMeetingsSnapshot,
): string[] {
  const errors: string[] = [];
  const registrations = new Map<string, TutorialMeetingsFenceRegistration>();

  for (const registration of registry.fences) {
    if (registrations.has(registration.id)) {
      errors.push(`duplicate registry fence id: ${registration.id}`);
    }
    registrations.set(registration.id, registration);
  }

  const extracted = new Map<string, { page: string; content: string }>();
  for (const page of registry.pages) {
    const pagePath = resolve(repoRoot, page);
    if (!existsSync(pagePath)) {
      errors.push(`missing Tutorial meetings page: ${page}`);
      continue;
    }
    const markdown = readFileSync(pagePath, "utf8");
    for (const fence of extractTutorialMeetingsFences(markdown)) {
      if (extracted.has(fence.id)) {
        errors.push(`duplicate tutorial fence id: ${fence.id}`);
        continue;
      }
      extracted.set(fence.id, { page, content: fence.content });
      const registration = registrations.get(fence.id);
      if (!registration) {
        errors.push(`unregistered tutorial fence id: ${fence.id}`);
      } else if (registration.page !== page) {
        errors.push(
          `tutorial fence ${fence.id} is in ${page}, expected ${registration.page}`,
        );
      }
    }
  }

  for (const registration of registry.fences) {
    const fence = extracted.get(registration.id);
    if (!fence) {
      errors.push(`missing tutorial fence id: ${registration.id}`);
      continue;
    }
    const snapshot = snapshotLoader(registration.part);
    const target = registration.snippet ?? registration.file;
    const expected = registration.snippet
      ? snapshot.snippets[registration.snippet]
      : registration.file
        ? snapshot.files[registration.file]
        : undefined;
    if (expected === undefined) {
      errors.push(
        `missing fixture target: part ${registration.part} ${target ?? "(unspecified)"}`,
      );
      continue;
    }
    if (!compareTutorialMeetingsFence(fence.content, expected, registration.compare)) {
      errors.push(`tutorial fence drift: ${registration.id}`);
    }
  }

  return errors;
}
