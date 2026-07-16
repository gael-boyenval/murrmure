#!/usr/bin/env node
// Tutorial v3 Task 08 — nested call/return drift guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = [
  "packages/contracts/src",
  "packages/hub-core/src",
  "packages/hub-daemon/src",
  "packages/view-sdk/src",
  "packages/shell-client/src",
  "packages/shell-web/src",
];
const REMOVED_CONTROL = /\b(?:complete_parent|continue_parent)\b/;
const EXCLUDED = new Set(["node_modules", "dist", "archives", "plans"]);

function files(path, out = []) {
  for (const name of readdirSync(path)) {
    if (EXCLUDED.has(name)) continue;
    const current = join(path, name);
    const stat = statSync(current);
    if (stat.isDirectory()) files(current, out);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(name)) out.push(current);
  }
  return out;
}

const failures = [];
for (const file of SOURCE_ROOTS.flatMap((path) => files(join(ROOT, path)))) {
  const text = readFileSync(file, "utf8");
  const match = REMOVED_CONTROL.exec(text);
  if (!match) continue;
  const line = text.slice(0, match.index).split("\n").length;
  failures.push(`${relative(ROOT, file)}:${line}: removed nested control '${match[0]}'`);
}

const required = new Map([
  [
    "test-utils/spaces/preview-review-v2/.mrmr/flows/preview-review/flow.manifest.yaml",
    ["resume: build"],
  ],
  [
    "test-utils/spaces/preview-review-v2/.mrmr/space/handlers.yaml",
    ["murrmure_open_child_step", "step.opened::preview-review.build.review"],
  ],
  [
    "packages/cli/skill-agent/SKILL.md",
    ["murrmure_open_child_step", "returned_child"],
  ],
  [
    "apps/docs/guide/creating-flows.md",
    ["murrmure_open_child_step", "returned_child"],
  ],
]);

for (const [path, markers] of required) {
  const text = readFileSync(join(ROOT, path), "utf8");
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${path}: missing '${marker}'`);
  }
}

if (failures.length) {
  console.error("check:nested-call-return — drift detected:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("check:nested-call-return — OK");
