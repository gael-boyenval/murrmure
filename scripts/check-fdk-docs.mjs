#!/usr/bin/env node
/**
 * Phase 10 — zero FDK resurrection in apps/docs (10-U6).
 */
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanFdkHits } from "./lib/fdk-docs-scan.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ROOT = join(REPO_ROOT, "apps/docs");

function main() {
  const hits = scanFdkHits(DOCS_ROOT, REPO_ROOT);

  if (hits.length > 0) {
    console.error("check:fdk-docs — FDK terms found in apps/docs:");
    for (const h of hits) console.error(`  ${h}`);
    process.exit(1);
  }

  console.log("check:fdk-docs — OK (zero FDK hits in apps/docs)");
  process.exit(0);
}

main();
