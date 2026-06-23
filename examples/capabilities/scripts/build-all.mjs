#!/usr/bin/env node
// Build every example flow via @murrmure/cli. Used by docs and conformance tests.
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFlowRoot } from "../../../packages/cli/dist/api.js";

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(here, "..");

const targets = readdirSync(examplesRoot).filter((name) => {
  const dir = join(examplesRoot, name);
  try {
    return statSync(join(dir, "flow.manifest.json")).isFile();
  } catch {
    return false;
  }
});

let failed = 0;
for (const name of targets) {
  const dir = join(examplesRoot, name);
  const result = await buildFlowRoot(dir);
  if (result.ok) {
    console.log(`ok   ${name}  digest=${result.bundleDigest.slice(0, 16)}…  stage=${result.stageDir}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
    for (const err of result.errors ?? []) {
      console.error(`     ${err.code}: ${err.message}`);
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} example(s) failed to build`);
  process.exit(1);
}
console.log(`\nBuilt ${targets.length} example flow bundle(s)`);
