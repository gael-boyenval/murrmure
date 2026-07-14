#!/usr/bin/env node
/**
 * Phase 10 — human known-gaps.md must match skill known-gaps body (10-U4).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUMAN = join(REPO_ROOT, "apps/docs/guide/known-gaps.md");
const SKILL = join(REPO_ROOT, "packages/cli/skill-agent/reference/known-gaps.md");

function normalizeBody(content, stripPrefix) {
  const idx = content.indexOf("---");
  const afterFront = idx >= 0 ? content.slice(content.indexOf("\n", idx) + 1) : content;
  let body = afterFront.trim();
  if (stripPrefix) {
    body = body.replace(/^# Known gaps \(agents\)\s*/m, "# Known gaps (Murrmure v2)\n");
    body = body.replace(
      /Read this before assuming declarative flows fully work\.[^\n]+\n\n\*\*Note:\*\*[^\n]+\n\n## Human docs\n\n\[apps\/docs\/guide\/known-gaps\.md\][^\n]+\n\n---\n\n/s,
      "",
    );
    body = body.replace(
      /See \[flow-authoring\.md\][^\n]+\n/,
      "See [Creating flows](./creating-flows) and [Quick start](./quick-start).\n",
    );
  }
  return body.replace(/\r\n/g, "\n").trim();
}

function extractComparableSections(human, skill) {
  const normalizeEntities = (text) =>
    text.replace(/&#123;/g, "{").replace(/&#125;/g, "}");
  const humanWhatWorks = normalizeEntities(
    human.match(/## What works today[\s\S]*/)?.[0]?.trim() ?? "",
  );
  const skillWhatWorks = normalizeEntities(
    skill.match(/## What works today[\s\S]*/)?.[0]?.trim() ?? "",
  );
  const skillNormalized = skillWhatWorks.replace(
    /See \[flow-authoring\.md\][^\n]+/,
    "See [Creating flows](./creating-flows) and [Quick start](./quick-start).",
  );
  return { humanWhatWorks, skillWhatWorks: skillNormalized };
}

function main() {
  if (!existsSync(HUMAN) || !existsSync(SKILL)) {
    console.error("check:known-gaps — missing known-gaps file(s)");
    process.exit(1);
  }

  const human = readFileSync(HUMAN, "utf-8");
  const skill = readFileSync(SKILL, "utf-8");
  const { humanWhatWorks, skillWhatWorks } = extractComparableSections(human, skill);

  if (humanWhatWorks !== skillWhatWorks) {
    console.error("check:known-gaps — human vs skill drift in 'What works today' section");
    console.error(`  human: ${HUMAN}`);
    console.error(`  skill: ${SKILL}`);
    process.exit(1);
  }

  console.log("check:known-gaps — OK (What works today sections match)");
  process.exit(0);
}

main();
