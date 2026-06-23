#!/usr/bin/env node
/**
 * Fix invalid npm names: @murrmure/runtime/foo → @murrmure/runtime-foo
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

const REPLACEMENTS = [
  ["@murrmure/runtime-adapter-http", "@murrmure/runtime-adapter-http"],
  ["@murrmure/runtime-persistence", "@murrmure/runtime-persistence"],
  ["@murrmure/runtime-contracts", "@murrmure/runtime-contracts"],
  ["@murrmure/runtime-kernel", "@murrmure/runtime-kernel"],
  ["@murrmure/runtime-daemon", "@murrmure/runtime-daemon"],
];

const PACKAGE_DIRS = [
  ["@murrmure/runtime-contracts", "packages/runtime-contracts/package.json"],
  ["@murrmure/runtime-kernel", "packages/runtime-kernel/package.json"],
  ["@murrmure/runtime-persistence", "packages/runtime-persistence/package.json"],
  ["@murrmure/runtime-adapter-http", "packages/runtime-adapter-http/package.json"],
  ["@murrmure/runtime-daemon", "packages/runtime-daemon/package.json"],
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "deprecated"]);
const EXTENSIONS = [".ts", ".tsx", ".json", ".md", ".yaml", ".yml", ".mjs", ".cjs"];

function transform(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(path, files);
    } else if (EXTENSIONS.some((ext) => name.endsWith(ext))) {
      files.push(path);
    }
  }
  return files;
}

let changed = 0;
for (const file of walk(REPO_ROOT)) {
  const before = readFileSync(file, "utf-8");
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
  }
}

for (const [name, rel] of PACKAGE_DIRS) {
  const pkgPath = join(REPO_ROOT, rel);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.name = name;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

console.log(`Fixed ${changed} files`);
