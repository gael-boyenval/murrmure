/** Accept `hooks.yaml` (canonical) and `triggers.yaml` (migration alias). */
export const HOOKS_FILENAMES = ["hooks.yaml", "triggers.yaml"] as const;

export type HooksFilename = (typeof HOOKS_FILENAMES)[number];

export function resolveHooksFilename(filename: string): HooksFilename | null {
  if (filename === "hooks.yaml" || filename === "triggers.yaml") {
    return filename;
  }
  return null;
}

export function isHooksResourcePath(relPath: string): boolean {
  const base = relPath.split("/").pop() ?? relPath;
  return resolveHooksFilename(base) !== null;
}
