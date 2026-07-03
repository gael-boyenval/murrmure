#!/usr/bin/env node
/**
 * CI spec-lint: validate journal CloudEvents fixtures under studio-specs/current/fixtures.
 * Phase 16 — promotion hygiene (lightweight CE shape check + vitest conformance).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(root, "studio-specs/current/fixtures");

function isJournalCloudEvent(obj) {
  if (!obj || typeof obj !== "object") return false;
  return (
    obj.specversion === "1.0" &&
    typeof obj.id === "string" &&
    typeof obj.source === "string" &&
    typeof obj.type === "string" &&
    (obj.time === undefined || typeof obj.time === "string")
  );
}

function collectJsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...collectJsonFiles(path));
    else if (name.endsWith(".json")) out.push(path);
  }
  return out;
}

function journalCandidates(obj, path = "") {
  const hits = [];
  if (obj && typeof obj === "object") {
    if (isJournalCloudEvent(obj)) hits.push({ path, value: obj });
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === "object") {
        hits.push(...journalCandidates(val, path ? `${path}.${key}` : key));
      }
    }
  }
  return hits;
}

const files = collectJsonFiles(fixturesDir);
let checked = 0;
const errors = [];

for (const file of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch (e) {
    errors.push(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  for (const { path } of journalCandidates(parsed)) {
    checked += 1;
    if (!path) errors.push(`${file}: invalid journal shape`);
  }
}

const vitest = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "packages/contracts/conformance/cloudevents.test.ts"],
  { cwd: root, stdio: "inherit" },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

if (errors.length > 0) {
  console.error("spec-lint-cloudevents failed:\n" + errors.join("\n"));
  process.exit(1);
}

console.log(
  `spec-lint-cloudevents: ${checked} journal-shaped fixture(s) OK across ${files.length} files + CE conformance tests green`,
);
