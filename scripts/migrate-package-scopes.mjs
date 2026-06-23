#!/usr/bin/env node
/**
 * Rename monorepo package scopes: @studio/* → @murrmure/*, @runtime/* → @murrmure/runtime/*
 * Run from repo root: node scripts/migrate-package-scopes.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

/** Longest-first to avoid partial replacements */
const REPLACEMENTS = [
  ["@murrmure/runtime-adapter-http", "@murrmure/runtime-adapter-http"],
  ["@murrmure/runtime-persistence", "@murrmure/runtime-persistence"],
  ["@murrmure/runtime-contracts", "@murrmure/runtime-contracts"],
  ["@murrmure/runtime-kernel", "@murrmure/runtime-kernel"],
  ["@murrmure/runtime-daemon", "@murrmure/runtime-daemon"],
  ["@murrmure/hub-persistence", "@murrmure/hub-persistence"],
  ["@murrmure/hub-daemon", "@murrmure/hub-daemon"],
  ["@murrmure/hub-client", "@murrmure/hub-client"],
  ["@murrmure/hub-core", "@murrmure/hub-core"],
  ["@murrmure/shell-web", "@murrmure/shell-web"],
  ["@murrmure/triggers-templates", "@murrmure/triggers-templates"],
  ["@murrmure/contracts", "@murrmure/contracts"],
  ["@murrmure/docs", "@murrmure/docs"],
];

const PACKAGE_NAME_MAP = {
  "@murrmure/contracts": "@murrmure/contracts",
  "@murrmure/hub-core": "@murrmure/hub-core",
  "@murrmure/hub-persistence": "@murrmure/hub-persistence",
  "@murrmure/hub-daemon": "@murrmure/hub-daemon",
  "@murrmure/hub-client": "@murrmure/hub-client",
  "@murrmure/shell-web": "@murrmure/shell-web",
  "@murrmure/docs": "@murrmure/docs",
  "@murrmure/triggers-templates": "@murrmure/triggers-templates",
  "@murrmure/runtime-contracts": "@murrmure/runtime-contracts",
  "@murrmure/runtime-kernel": "@murrmure/runtime-kernel",
  "@murrmure/runtime-persistence": "@murrmure/runtime-persistence",
  "@murrmure/runtime-adapter-http": "@murrmure/runtime-adapter-http",
  "@murrmure/runtime-daemon": "@murrmure/runtime-daemon",
};

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "deprecated",
  "capability-sdk",
  "capability-dev-kit",
  "studio-hub-mcp",
  "studio-hub-cli",
  "studio-skill",
]);

const EXTENSIONS = [".ts", ".tsx", ".json", ".md", ".yaml", ".yml", ".mjs", ".cjs", ".html"];

function transform(content) {
  let out = content;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  return out;
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walk(path, files);
      continue;
    }
    if (EXTENSIONS.some((ext) => name.endsWith(ext))) {
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

for (const [oldName, newName] of Object.entries(PACKAGE_NAME_MAP)) {
  const pkgDir = oldName.replace("@studio/", "packages/studio-").replace("@murrmure/runtime/", "packages/runtime-");
  // resolve package.json paths
  const candidates = [
    join(REPO_ROOT, "packages", oldName.replace("@studio/", "studio-"), "package.json"),
    join(REPO_ROOT, "packages", oldName.replace("@murrmure/runtime/", "runtime-"), "package.json"),
    join(REPO_ROOT, "apps", "docs", "package.json"),
    join(REPO_ROOT, "packages", "shell-web", "package.json"),
    join(REPO_ROOT, "packages", "triggers-templates", "package.json"),
  ];
  for (const pkgPath of candidates) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.name === oldName) {
        pkg.name = newName;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
        console.log(`${oldName} → ${newName} (${pkgPath})`);
      }
    } catch {
      /* skip missing */
    }
  }
}

console.log(`Updated ${changed} files`);
