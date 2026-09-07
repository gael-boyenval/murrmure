#!/usr/bin/env node
/**
 * Phase 10 — human known-gaps.md must match skill known-gaps body (10-U4).
 * Witness: `node scripts/check-known-gaps.mjs --json` → DOC-SYNC-KNOWN-GAPS findings.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emitJsonFindings,
  filterFindings,
  relFromRoot,
  witnessArgv,
} from "./lib/witness-findings.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUMAN = join(REPO_ROOT, "apps/docs/guide/known-gaps.md");
const SKILL = join(REPO_ROOT, "packages/cli/skill-agent/reference/known-gaps.md");
const HUMAN_REL = relFromRoot(REPO_ROOT, HUMAN);
const SKILL_REL = relFromRoot(REPO_ROOT, SKILL);
const WITNESS = witnessArgv();

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

function knownGapsFindings() {
  if (!existsSync(HUMAN) || !existsSync(SKILL)) {
    return [
      {
        ruleId: "DOC-SYNC-KNOWN-GAPS",
        file: HUMAN_REL,
        smell: "check:known-gaps — missing known-gaps file(s)",
        severity: "error",
      },
    ];
  }

  const human = readFileSync(HUMAN, "utf-8");
  const skill = readFileSync(SKILL, "utf-8");
  const { humanWhatWorks, skillWhatWorks } = extractComparableSections(human, skill);

  if (humanWhatWorks !== skillWhatWorks) {
    return [
      {
        ruleId: "DOC-SYNC-KNOWN-GAPS",
        file: HUMAN_REL,
        smell:
          "Human vs skill drift in 'What works today' section (apps/docs/guide/known-gaps.md ↔ packages/cli/skill-agent/reference/known-gaps.md)",
        severity: "error",
      },
    ];
  }

  return [];
}

function main() {
  const findings = filterFindings(knownGapsFindings(), WITNESS.path);

  if (WITNESS.json) {
    emitJsonFindings(findings);
  }

  if (findings.length) {
    console.error("check:known-gaps — human vs skill drift in 'What works today' section");
    console.error(`  human: ${HUMAN}`);
    console.error(`  skill: ${SKILL}`);
    process.exit(1);
  }

  console.log("check:known-gaps — OK (What works today sections match)");
  process.exit(0);
}

main();
