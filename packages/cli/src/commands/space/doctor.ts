import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { cliConsola, isJsonMode } from "../../lib/output.js";
import { printSpaceDoctorHuman } from "../../lib/space-doctor-print.js";
import { runSpaceDoctor } from "../../lib/space-doctor.js";
import {
  extractCommandFromMcpSnippet,
  extractConnectionIdFromMcpSnippet,
  rewriteFatMcpConfigFiles,
} from "../../lib/space-doctor-mcp.js";

export const spaceDoctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description:
      "Diagnose murrmure/ workspace, hub index drift, legacy layout, and contract tests (Requires: none — hub checks need auth)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root or subdirectory containing murrmure/ (default: .)",
    },
    "skip-tests": {
      type: "boolean",
      description: "Skip murrmure/flows/**/tests contract tests",
      default: false,
    },
    fix: {
      type: "boolean",
      description:
        "Rewrite mcp.json to murrmure-mcp + --connection <con_…> (Hub from discovery; no --hub)",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const cwd = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const shouldFix = Boolean(args.fix);

    let result = await runSpaceDoctor({
      cwd,
      flags,
      skipTests: Boolean(args["skip-tests"]),
    });

    if (shouldFix) {
      const connectionId = extractConnectionIdFromMcpSnippet(result.mcp?.suggested_snippet);
      const command = extractCommandFromMcpSnippet(result.mcp?.suggested_snippet);
      const configPaths = [
        ...(result.mcp?.config_paths ?? []),
        ...(result.mcp?.suggested_config_path ? [result.mcp.suggested_config_path] : []),
      ];
      const rewrite = rewriteFatMcpConfigFiles({
        configPaths,
        preferredConfigPath: result.mcp?.suggested_config_path,
        connectionId,
        command,
        tokenFallback: flags.token,
      });

      if (!isJsonMode() && !flags.json) {
        if (rewrite.rewritten.length > 0) {
          for (const path of rewrite.rewritten) {
            cliConsola.success(`Rewrote MCP config: ${path}`);
          }
        } else if (!connectionId) {
          cliConsola.warn(
            "Could not fix MCP config — no local connection for this space. Run mrmr connection create --space <spc_…> first.",
          );
        } else if (rewrite.errors.length === 0) {
          cliConsola.info("MCP config already canonical (or nothing to rewrite).");
        }
        for (const error of rewrite.errors) {
          cliConsola.error(`${error.path}: ${error.message}`);
        }
      }

      result = await runSpaceDoctor({
        cwd,
        flags,
        skipTests: Boolean(args["skip-tests"]),
      });
      if (flags.json || isJsonMode()) {
        console.log(
          JSON.stringify(
            {
              ...result,
              fix: {
                rewritten: rewrite.rewritten,
                errors: rewrite.errors,
                connection_id: connectionId ?? null,
              },
            },
            null,
            2,
          ),
        );
        if (!result.ok) process.exit(1);
        return;
      }
    }

    if (isJsonMode() || flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printSpaceDoctorHuman(result);
    }

    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
