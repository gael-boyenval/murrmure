#!/usr/bin/env node
// Build every example capability via the CDK SDK. Used by docs and the CDK
// conformance tests. The SDK ships as raw TypeScript, so register the tsx ESM
// loader (installed at the repo root) before importing it — no per-example
// `npm install` required.
import { createRequire } from "node:module";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const examplesRoot = join(here, "..");
const repoRoot = join(examplesRoot, "..", "..");

// tsx is a dependency of the hub daemon; resolve its programmatic register API
// relative to it (pnpm does not hoist tsx to the repo root) and enable TS imports.
const requireFromDaemon = createRequire(join(repoRoot, "packages", "studio-hub-daemon", "package.json"));
const { register } = await import(pathToFileURL(requireFromDaemon.resolve("tsx/esm/api")).href);
register();

const sdkEntry = join(repoRoot, "packages", "capability-sdk", "src", "index.ts");
const { buildCapabilityRoot } = await import(pathToFileURL(sdkEntry).href);

const targets = readdirSync(examplesRoot).filter((name) => {
  const dir = join(examplesRoot, name);
  try {
    return statSync(join(dir, "capability.manifest.json")).isFile();
  } catch {
    return false;
  }
});

let failed = 0;
for (const name of targets) {
  const dir = join(examplesRoot, name);
  const result = await buildCapabilityRoot(dir);
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
console.log(`\nBuilt ${targets.length} example capability bundle(s)`);
