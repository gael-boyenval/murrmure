#!/usr/bin/env node
// Enforcement for Tutorial v3 Task 11 — canonical run-scratch root.
//
// Two invariants are enforced across active surfaces:
//   1. No `.mrmr.temp/runs` remains in active code, tests, fixtures, specs,
//      tutorials, skills, or scaffolds. `.mrmr/dev/runs/{run_id}/` is the only
//      local run-scratch root. (`.mrmr.temp/inbox` cross-space exchange and the
//      `space-doctor` legacy-root cleanup list are separate concepts and not
//      flagged; archived plans and the legacy v2 example fixture are excluded —
//      the v2 cutover is owned by the clean-slate task.)
//   2. No literal run-root construction in production source outside the
//      canonical helper `packages/hub-core/src/flow-engine/run-scratch-paths.ts`.
//      All run-scratch paths must be built via `runScratchDir` / `spaceRunsDir`
//      so there is one constructor and no drift.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRODUCTION_SOURCE_ROOTS = [
  "packages/hub-daemon/src",
  "packages/hub-core/src",
  "packages/runtime-contracts/src",
  "packages/runtime-persistence/src",
  "packages/executors/src",
  "packages/mcp-bridge/src",
  "packages/cli/src",
  "packages/view-sdk/src",
  "apps/desktop/src",
];

const ACTIVE_ROOTS = [
  ...PRODUCTION_SOURCE_ROOTS,
  "packages/hub-core/test",
  "packages/hub-daemon/test",
  "packages/executors/conformance",
  "packages/contracts/test",
  "packages/mcp-bridge/test",
  "packages/cli/test",
  "test-utils/spaces/tutorial-v3",
  "test-utils/tutorial-v3",
  "apps/docs",
  "studio-specs/current",
  "packages/cli/skill-agent",
  "packages/cli/skill-developer",
  "packages/cli/templates",
];

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "archives",
  "plans",
]);

// `run-scratch-paths.ts` is the single allowed constructor of the literal root.
const CANONICAL_HELPER = "packages/hub-core/src/flow-engine/run-scratch-paths.ts";

// Rule 1: stale run root.
const STALE_RUN_ROOT = /\.mrmr\.temp\/runs\b/;
// Rule 2: literal join("…", ".mrmr", "dev", "runs") construction (any quotes).
const LITERAL_RUN_ROOT_CONSTRUCTION = /["'`]\.mrmr["'`]\s*,\s*["']dev["']\s*,\s*["']runs["']/;

function collectFiles(root, filePattern, out = []) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const path = join(root, entry);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      collectFiles(path, filePattern, out);
    } else if (filePattern.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const hits = [];

// Rule 1 — stale `.mrmr.temp/runs` across active surfaces.
const activeFiles = ACTIVE_ROOTS.flatMap((path) =>
  collectFiles(join(REPO_ROOT, path), /\.(?:ts|tsx|js|mjs|json|md|ya?ml)$/),
);
for (const file of activeFiles) {
  const content = readFileSync(file, "utf-8");
  const match = content.match(STALE_RUN_ROOT);
  if (match?.index != null) {
    const line = content.slice(0, match.index).split("\n").length;
    hits.push(`${relative(REPO_ROOT, file)}:${line}: stale run root .mrmr.temp/runs: ${match[0]}`);
  }
}

// Rule 2 — literal run-root construction in production source outside the helper.
const productionFiles = PRODUCTION_SOURCE_ROOTS.flatMap((path) =>
  collectFiles(join(REPO_ROOT, path), /\.(?:ts|tsx|js|mjs)$/),
);
for (const file of productionFiles) {
  if (relative(REPO_ROOT, file) === CANONICAL_HELPER) continue;
  const content = readFileSync(file, "utf-8");
  const match = content.match(LITERAL_RUN_ROOT_CONSTRUCTION);
  if (match?.index != null) {
    const line = content.slice(0, match.index).split("\n").length;
    hits.push(
      `${relative(REPO_ROOT, file)}:${line}: literal run-root construction (use runScratchDir/spaceRunsDir): ${match[0]}`,
    );
  }
}

if (hits.length > 0) {
  console.error("check:run-scratch-paths — canonical run-scratch root violation:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log("check:run-scratch-paths — OK (no stale run root, one canonical constructor)");
