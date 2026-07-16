/**
 * Type declarations for `scripts/lib/fdk-docs-scan.mjs` — the shared FDK
 * resurrection scan used by `scripts/check-fdk-docs.mjs` and
 * `packages/cli/test/docs-proof.test.ts`. The implementation ships as `.mjs`
 * (no types), so this ambient declaration provides the typed surface.
 */

export const FDK_PATTERN: RegExp;
export const TEXT_EXT: RegExp;
export const FDK_DOCS_SKIP: Set<string>;
export function collectDocsFiles(docsRoot: string): string[];
export function scanFdkHits(docsRoot: string, repoRoot?: string): string[];
