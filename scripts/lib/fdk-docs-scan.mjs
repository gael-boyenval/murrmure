/**
 * Shared FDK resurrection scan for apps/docs (10-U6).
 * Used by scripts/check-fdk-docs.mjs and packages/cli/test/docs-proof.test.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const FDK_PATTERN =
  /flow push|flow-dev-kit|@murrmure\/flow-kit|mrmr flow init(?![\s\S]{0,40}space flow init)|create_review_session|wait_for_review|installExampleCapability|flow-evolution|Flow evolution pipeline|Flow Dev Kit|\bFDK\b|evolution HTTP|evolution-pipeline|capability-authoring/i;

export const TEXT_EXT = /\.(md|ts|tsx|json|html)$/i;

export const FDK_DOCS_SKIP = new Set(["node_modules", ".vitepress/cache", "dist"]);

export function collectDocsFiles(docsRoot) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (FDK_DOCS_SKIP.has(entry)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (TEXT_EXT.test(entry)) out.push(full);
    }
  };
  walk(docsRoot);
  return out;
}

/** @returns {string[]} `relativePath:line: match` entries */
export function scanFdkHits(docsRoot, repoRoot = docsRoot) {
  const hits = [];
  for (const file of collectDocsFiles(docsRoot)) {
    const content = readFileSync(file, "utf-8");
    const match = content.match(FDK_PATTERN);
    if (match) {
      const line = content.slice(0, match.index).split("\n").length;
      const rel = repoRoot === docsRoot ? file : file.replace(`${repoRoot}/`, "").replace(`${repoRoot}\\`, "");
      hits.push(`${rel}:${line}: ${match[0]}`);
    }
  }
  return hits;
}
