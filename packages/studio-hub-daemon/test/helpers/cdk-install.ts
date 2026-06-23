import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFlowRoot, initFlow } from "@murrmure/cli/api";
import { linkScaffoldWorkspaceDeps } from "./link-scaffold-deps.js";

export interface StagedBundle {
  packageId: string;
  flowId: string;
  version: string;
  stageDir: string;
  digest: string;
  cleanup: () => void;
}

/**
 * Scaffold a fresh flow and build it into the hub's staging dir,
 * which is allowlisted for local-path bundle installs. Returns the staged
 * bundle path for use as `bundle.local_path` with POST /flows/install.
 *
 * The build digest is not passed back as a claimed digest because the hub
 * recomputes the directory digest on ingest with different exclusions.
 */
export async function buildScaffoldBundle(opts: {
  packageId: string;
  hubDataDir: string;
}): Promise<StagedBundle> {
  const srcRoot = mkdtempSync(join(tmpdir(), "cdk-src-"));
  const srcDir = join(srcRoot, opts.packageId);
  initFlow(opts.packageId, srcDir);
  linkScaffoldWorkspaceDeps(srcDir);

  const built = await buildFlowRoot(srcDir, {
    outDir: join(opts.hubDataDir, "staging", opts.packageId),
  });
  if (!built.ok) {
    throw new Error(`Flow build failed: ${JSON.stringify(built.errors)}`);
  }

  return {
    packageId: opts.packageId,
    flowId: opts.packageId,
    version: "0.1.0",
    stageDir: built.stageDir,
    digest: built.bundleDigest,
    cleanup: () => rmSync(srcRoot, { recursive: true, force: true }),
  };
}
