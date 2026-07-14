import { basename, resolve } from "node:path";

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface SpaceIdentity {
  name: string;
  slug: string;
}

export function defaultSpaceName(projectPath: string): string {
  const folder = basename(resolve(projectPath)).trim();
  return folder || "my-space";
}

export function normalizeSpaceSlug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(NON_SLUG_CHARS, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return normalized || "space";
}

export function validateSpaceName(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return "Space name is required";
  }
  return undefined;
}

export function validateSpaceSlug(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return "Space slug is required";
  }
  if (value.length > 63) {
    return "Space slug must be 63 characters or fewer";
  }
  if (!VALID_SLUG.test(value)) {
    return "Use lowercase letters, numbers, and single hyphens";
  }
  return undefined;
}

export function resolveSpaceIdentity(
  projectPath: string,
  input?: { name?: string; slug?: string },
): SpaceIdentity {
  const name = input?.name?.trim() || defaultSpaceName(projectPath);
  const slug = input?.slug?.trim() || normalizeSpaceSlug(name);
  const nameError = validateSpaceName(name);
  const slugError = validateSpaceSlug(slug);
  if (nameError || slugError) {
    throw new Error(nameError ?? slugError);
  }
  return { name, slug };
}
