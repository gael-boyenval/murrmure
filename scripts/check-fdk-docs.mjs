#!/usr/bin/env node
/**
 * Phase 10 — zero FDK resurrection in apps/docs (10-U6).
 * Witness: `node scripts/check-fdk-docs.mjs --json` → DOC-SYNC-FDK-ZERO findings.
 */
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanFdkHits } from "./lib/fdk-docs-scan.mjs";
import {
  emitJsonFindings,
  filterFindings,
  relFromRoot,
  witnessArgv,
} from "./lib/witness-findings.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ROOT = join(REPO_ROOT, "apps/docs");
const WITNESS = witnessArgv();

function fdkFindings() {
  const hits = scanFdkHits(DOCS_ROOT, REPO_ROOT);
  return hits.map((hit) => {
    const [filePart] = hit.split(":");
    return {
      ruleId: "DOC-SYNC-FDK-ZERO",
      file: filePart ?? relFromRoot(REPO_ROOT, DOCS_ROOT),
      smell: `FDK term found in apps/docs: ${hit}`,
      severity: "error",
    };
  });
}

function main() {
  const findings = filterFindings(fdkFindings(), WITNESS.path);

  if (WITNESS.json) {
    emitJsonFindings(findings);
  }

  if (findings.length > 0) {
    console.error("check:fdk-docs — FDK terms found in apps/docs:");
    for (const h of scanFdkHits(DOCS_ROOT, REPO_ROOT)) console.error(`  ${h}`);
    process.exit(1);
  }

  console.log("check:fdk-docs — OK (zero FDK hits in apps/docs)");
  process.exit(0);
}

main();
