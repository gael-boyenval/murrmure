import { defineCommand, type CommandDef } from "citty";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { readSpaceApplyBundle, validateSpaceBundleCycles } from "../../lib/space-directory.js";
import { readSpaceLink } from "../../lib/space-link-file.js";
import { lintSpaceApplyBundle, strictLintFailures, formatCatalogDigestSummary, compileStepContractCatalog } from "@murrmure/hub-core";

function writeContractSnapshots(projectPath: string, bundle: Awaited<ReturnType<typeof readSpaceApplyBundle>>): void {
  const contractsDir = join(projectPath, ".mrmr", "dev", "contracts");
  mkdirSync(contractsDir, { recursive: true });

  const catalogSnapshot: Array<{
    flow_id: string;
    flow_name: string;
    graph_digest: string;
    catalog: ReturnType<typeof compileStepContractCatalog>["catalog"];
  }> = [];

  const keysSnapshot: Array<{
    contract_key: string;
    flow_ref: string;
    step_id: string;
    branches: string[];
    artifact_slots: string[];
  }> = [];

  for (const flow of bundle.flows ?? []) {
    const { catalog } = compileStepContractCatalog(flow.manifest, flow.flow_id);
    if (!catalog) continue;
    const flowRef = `${flow.flow_id}@${catalog.graph_digest.slice(0, 12)}`;
    catalogSnapshot.push({
      flow_id: flow.flow_id,
      flow_name: flow.manifest.name,
      graph_digest: catalog.graph_digest,
      catalog,
    });
    for (const entry of catalog.entries) {
      keysSnapshot.push({
        contract_key: `${flow.manifest.name}.${entry.step_id}`,
        flow_ref: flowRef,
        step_id: entry.step_id,
        branches: Object.keys(entry.branches),
        artifact_slots: Array.from(
          new Set(Object.values(entry.branches).flatMap((branch) => Object.keys(branch.artifact_slots))),
        ),
      });
    }
  }

  writeFileSync(join(contractsDir, "catalog.json"), `${JSON.stringify(catalogSnapshot, null, 2)}\n`, "utf-8");
  writeFileSync(join(contractsDir, "contract-keys.json"), `${JSON.stringify(keysSnapshot, null, 2)}\n`, "utf-8");
}

export const spaceApplyCommand = defineCommand({
  meta: {
    name: "apply",
    description: "Validate local .mrmr/ files and POST index apply (Requires: space:write)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root containing .mrmr/ (default: .)",
    },
    strict: {
      type: "boolean",
      description: "Fail (exit 1) on any apply lint warning (no warn-only codes remain post-cutover)",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const strict = Boolean(args.strict);
    const projectPath = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const link = readSpaceLink(projectPath);
    const spaceId = flags.space ?? link?.space_id;
    if (!spaceId) {
      printErr("USAGE", "Missing --space — run `mrmr space link` first");
    }

    let bundle;
    try {
      bundle = readSpaceApplyBundle(projectPath);
      validateSpaceBundleCycles(bundle);
    } catch (error) {
      printErr("APPLY_VALIDATION_FAILED", error instanceof Error ? error.message : "Validation failed");
    }

    const localWarnings = lintSpaceApplyBundle(bundle);
    for (const warning of localWarnings) {
      const label = warning.step_id ? `${warning.flow_id}/${warning.step_id}` : warning.flow_id;
      cliConsola.warn(`[${warning.code}] ${label}: ${warning.message}`);
    }
    if (strict && strictLintFailures(localWarnings).length > 0) {
      printErr(
        "APPLY_LINT_STRICT",
        `${strictLintFailures(localWarnings).length} apply lint warning(s) under --strict`,
      );
    }

    const { auth } = await runScopePreflight(flags, "space:write", spaceId);
    const res = await hubFetch(auth, `/v1/spaces/${spaceId}/apply`, {
      method: "POST",
      json: { bundle },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const denial = mapHubDenial(res.status, body);
      printErr(denial.code, denial.message, "hint" in denial ? denial.hint : undefined);
    }
    writeContractSnapshots(projectPath, bundle);

    const hubWarnings = Array.isArray(body.warnings) ? body.warnings : [];
    for (const warning of hubWarnings as Array<{ code?: string; message?: string; flow_id?: string; step_id?: string }>) {
      const label = warning.step_id ? `${warning.flow_id}/${warning.step_id}` : warning.flow_id;
      cliConsola.warn(`[${warning.code}] ${label}: ${warning.message}`);
    }

    if (isJsonMode() || flags.json) {
      printOk(body);
      return;
    }

    const summary = body.summary as { actions?: number; flows?: number; changed?: number } | undefined;
    const warnCount = hubWarnings.length || localWarnings.length;
    const warnSuffix = warnCount > 0 ? ` · ${warnCount} warning(s)` : "";

    const catalogLines: string[] = [];
    for (const flow of bundle.flows ?? []) {
      const { catalog } = compileStepContractCatalog(flow.manifest, flow.flow_id);
      if (catalog) {
        catalogLines.push(formatCatalogDigestSummary(catalog));
      }
    }
    const catalogSuffix =
      catalogLines.length > 0 ? ` · catalog ${catalogLines.join(", ")}` : "";

    printOk(
      {},
      `✓ Indexed ${summary?.actions ?? 0} action(s), ${summary?.flows ?? 0} flow(s) (${summary?.changed ?? 0} changed)${warnSuffix}${catalogSuffix}`,
    );
  },
}) as CommandDef;
