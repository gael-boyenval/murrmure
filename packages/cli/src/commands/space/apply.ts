import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { hubFetch } from "../../auth.js";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { mapHubDenial } from "../../lib/hub-request.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import { runScopePreflight } from "../../lib/preflight.js";
import { readSpaceApplyBundle, validateSpaceBundleCycles } from "../../lib/space-directory.js";
import { readSpaceLink } from "../../lib/space-link-file.js";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";

export const spaceApplyCommand = defineCommand({
  meta: {
    name: "apply",
    description: "Validate local murrmure/ files and POST index apply (Requires: space:write)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root containing murrmure/ (default: .)",
    },
    strict: {
      type: "boolean",
      description: "Fail (exit 1) on apply lint warnings except DEPRECATED_START_KEY and CHECKPOINT_LOOPBACK_HINT",
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
    printOk(
      {},
      `✓ Indexed ${summary?.actions ?? 0} action(s), ${summary?.flows ?? 0} flow(s) (${summary?.changed ?? 0} changed)${warnSuffix}`,
    );
  },
}) as CommandDef;
