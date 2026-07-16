#!/usr/bin/env node
/**
 * Doc drift check — warn-only phases 01–09; strict (exit 1) from phase 10.
 * Tracker + decision archived with the shipped product plan (2026-07):
 * studio-specs/archives/plans/shipped-2026-07/product-plan/
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRACKER = join(
  REPO_ROOT,
  "studio-specs/archives/plans/shipped-2026-07/product-plan/00-doc-skill-mcp-tracker.md",
);
const STRICT = process.argv.includes("--strict") || process.env.DOC_TRACKER_STRICT === "1";
const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

const CODE_PREFIXES = ["packages/", "apps/", "studio-specs/plans/"];

/** Doc/skill paths referenced in the tracker (backtick paths). */
function extractTrackerDocPaths(content) {
  const paths = new Set();
  const re = /`((?:apps|packages|studio-specs)[^`\s]+)`/g;
  for (const match of content.matchAll(re)) {
    const p = match[1];
    if (p.endsWith(".md") || p.endsWith(".yaml") || p.includes("/")) {
      paths.add(p.replace(/^\.\.\/\.\.\/\.\.\//, "").replace(/^\.\.\//, ""));
    }
  }
  return [...paths].sort();
}

function collectFilesUnder(relDir) {
  const abs = join(REPO_ROOT, relDir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      const st = statSync(full);
      if (st.isDirectory()) walk(full, rel);
      else out.push(rel);
    }
  };
  walk(abs, relDir.replace(/\/$/, ""));
  return out;
}

/** Expand brace/glob tracker paths (e.g. guide/{a,b,tutorials/**}) to concrete repo paths. */
function expandTrackerPath(pattern) {
  const braceStart = pattern.indexOf("{");
  if (braceStart === -1) return [pattern];

  const prefix = pattern.slice(0, braceStart);
  const braceEnd = pattern.indexOf("}", braceStart);
  if (braceEnd === -1) return [pattern];

  const suffix = pattern.slice(braceEnd + 1);
  const alts = pattern.slice(braceStart + 1, braceEnd).split(",");
  const expanded = [];

  for (const alt of alts) {
    const candidate = `${prefix}${alt}${suffix}`;
    if (alt.includes("**") || alt.includes("*")) {
      const globDir = candidate.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "");
      expanded.push(...collectFilesUnder(globDir));
      continue;
    }

    const withExt = candidate.endsWith(".md") ? candidate : `${candidate}.md`;
    if (existsSync(join(REPO_ROOT, withExt))) {
      expanded.push(withExt);
    } else if (existsSync(join(REPO_ROOT, candidate))) {
      expanded.push(candidate);
    } else {
      expanded.push(withExt, candidate);
    }
  }

  return [...new Set(expanded)];
}

function expandAllTrackerPaths(paths) {
  const out = new Set();
  for (const p of paths) {
    for (const e of expandTrackerPath(p)) out.add(e);
  }
  return [...out];
}

function fileMatchesTrackerDoc(file, expandedDocPaths) {
  return expandedDocPaths.some((docPath) => {
    if (file === docPath) return true;
    if (file.startsWith(`${docPath}/`)) return true;
    const noExt = docPath.replace(/\.md$/, "");
    if (file === noExt || file.startsWith(`${noExt}/`) || file.startsWith(`${noExt}.`)) return true;
    return false;
  });
}

function runGit(args) {
  return execSync(`git ${args}`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function gitChangedFilesWorkingTree() {
  try {
    const out = runGit("diff --name-only HEAD");
    const staged = runGit("diff --name-only --cached HEAD");
    const untracked = runGit("ls-files --others --exclude-standard");
    const all = new Set();
    for (const block of [out, staged, untracked]) {
      for (const line of block.split("\n").filter(Boolean)) all.add(line);
    }
    return [...all];
  } catch {
    return [];
  }
}

function gitChangedFilesCi() {
  const event = process.env.GITHUB_EVENT_NAME;
  const baseRef = process.env.GITHUB_BASE_REF;

  const diffNames = (range) => {
    try {
      const out = runGit(`diff --name-only ${range}`);
      return out ? out.split("\n").filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  if (event === "pull_request" && baseRef) {
    try {
      runGit(`fetch origin ${baseRef} --depth=1`);
    } catch {
      /* shallow fetch may already include base */
    }
    const prFiles = diffNames(`origin/${baseRef}...HEAD`);
    if (prFiles.length > 0) return prFiles;
  }

  if (event === "push") {
    const pushFiles = diffNames("HEAD~1...HEAD");
    if (pushFiles.length > 0) return pushFiles;
  }

  for (const base of ["origin/main", "main"]) {
    try {
      runGit(`fetch origin ${base.replace("origin/", "")} --depth=1`);
    } catch {
      /* ignore */
    }
    const files = diffNames(`${base}...HEAD`);
    if (files.length > 0) return files;
  }

  try {
    const mergeBase = runGit("merge-base HEAD origin/main");
    return diffNames(`${mergeBase}...HEAD`);
  } catch {
    return [];
  }
}

function gitChangedFiles() {
  if (STRICT && IS_CI) return gitChangedFilesCi();
  return gitChangedFilesWorkingTree();
}

function failOrWarn(message) {
  if (STRICT) {
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

function main() {
  if (!existsSync(TRACKER)) {
    const msg = `check:doc-tracker — tracker not found at ${TRACKER}`;
    if (STRICT) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    process.exit(0);
  }

  const trackerContent = readFileSync(TRACKER, "utf-8");
  const docPaths = extractTrackerDocPaths(trackerContent);
  const expandedDocPaths = expandAllTrackerPaths(docPaths);
  const changed = gitChangedFiles();
  const codeChanges = changed.filter((f) => CODE_PREFIXES.some((p) => f.startsWith(p)));

  if (codeChanges.length === 0) {
    const scope = STRICT && IS_CI ? "strict CI (PR/push diff)" : STRICT ? "strict" : "warn";
    console.log(`check:doc-tracker — no packages/apps/plan code changes; skip (${scope})`);
    process.exit(0);
  }

  const overlap = changed.filter((f) => fileMatchesTrackerDoc(f, expandedDocPaths));
  if (overlap.length === 0) {
    failOrWarn(
      "check:doc-tracker — code changed but no tracker-listed doc/skill file updated in this change set",
    );
    console.warn(
      `  Code files (${codeChanges.length}): ${codeChanges.slice(0, 8).join(", ")}${codeChanges.length > 8 ? "…" : ""}`,
    );
    console.warn(`  Consider updating paths from ${TRACKER}`);
    if (!STRICT) process.exit(0);
    process.exit(1);
  }

  console.log(
    `check:doc-tracker — OK: ${overlap.length} tracker doc(s) touched (${overlap.join(", ")}) [${STRICT ? (IS_CI ? "strict CI" : "strict") : "warn"}]`,
  );
  process.exit(0);
}

main();
