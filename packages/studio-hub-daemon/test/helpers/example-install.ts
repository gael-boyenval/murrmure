import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityRoot } from "@studio/capability-sdk";
import { buildScaffoldBundle, type StagedBundle } from "./cdk-install.js";

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

export interface ExampleBundle extends StagedBundle {
  contractRefId: string;
}

/**
 * Build a reference example capability from examples/capabilities/<id> and stage
 * it for local-path install.
 */
export async function buildExampleBundle(opts: {
  exampleId: "feature-spec" | "review-loop";
  hubDataDir: string;
  version?: string;
}): Promise<ExampleBundle> {
  const sourceDir = join(REPO_ROOT, "examples/capabilities", opts.exampleId);
  const built = await buildCapabilityRoot(sourceDir, {
    outDir: join(opts.hubDataDir, "staging", opts.exampleId, opts.version ?? "default"),
  });
  if (!built.ok) {
    throw new Error(`Example build failed: ${JSON.stringify(built.errors)}`);
  }

  const contractRefId = opts.exampleId === "feature-spec" ? "cref_feature_spec" : "cref_review_loop";
  const version =
    opts.version ?? (opts.exampleId === "feature-spec" ? "1.1.0" : "2.0.0");

  return {
    packageId: opts.exampleId,
    version,
    stageDir: built.stageDir,
    digest: built.bundleDigest,
    contractRefId,
    cleanup: () => undefined,
  };
}

export { buildScaffoldBundle, type StagedBundle };

/**
 * Install, validate, test, and optionally apply an example capability bundle.
 */
export async function installExampleCapability(opts: {
  baseUrl: string;
  spaceId: string;
  bootstrapHeaders: () => Record<string, string>;
  exampleId: "feature-spec" | "review-loop";
  hubDataDir: string;
  version?: string;
  targetState?: "draft" | "live";
  apply?: boolean;
  config?: Record<string, unknown>;
}): Promise<{ install_id: string; staged: ExampleBundle }> {
  const staged = await buildExampleBundle({
    exampleId: opts.exampleId,
    hubDataDir: opts.hubDataDir,
    version: opts.version,
  });

  const install = await fetch(`${opts.baseUrl}/v1/spaces/${opts.spaceId}/capabilities/install`, {
    method: "POST",
    headers: opts.bootstrapHeaders(),
    body: JSON.stringify({
      package_id: staged.packageId,
      version: staged.version,
      target_state: opts.targetState ?? "draft",
      config: opts.config ?? {},
      bundle: { mode: "local-path", local_path: staged.stageDir },
    }),
  });
  if (!install.ok) throw new Error(`Install failed: ${await install.text()}`);
  const installBody = await install.json();
  const installId = installBody.install_id as string;

  for (const path of ["validate", "test"]) {
    const step = await fetch(`${opts.baseUrl}/v1/spaces/${opts.spaceId}/evolution/${path}`, {
      method: "POST",
      headers: opts.bootstrapHeaders(),
      body: JSON.stringify({ install_id: installId }),
    });
    if (!step.ok) throw new Error(`${path} failed: ${await step.text()}`);
  }

  if (opts.apply !== false) {
    const apply = await fetch(`${opts.baseUrl}/v1/spaces/${opts.spaceId}/capabilities/${installId}/apply`, {
      method: "POST",
      headers: opts.bootstrapHeaders(),
    });
    if (!apply.ok) throw new Error(`Apply failed: ${await apply.text()}`);
  }

  return { install_id: installId, staged };
}
