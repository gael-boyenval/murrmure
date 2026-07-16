import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { isJsonMode } from "../../lib/output.js";
import { printSpaceDoctorHuman } from "../../lib/space-doctor-print.js";
import { runSpaceDoctor } from "../../lib/space-doctor.js";
import { rewriteFatMcpConfigFiles } from "../../lib/space-doctor-mcp.js";

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
      description: "Rewrite detected fat mcp.json entries to thin murrmure-mcp shape",
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
    if (shouldFix && result.mcp?.config_paths?.length) {
      const rewritten = rewriteFatMcpConfigFiles({
        configPaths: result.mcp.config_paths,
        tokenFallback: flags.token,
      });
      if (rewritten.rewritten.length > 0) {
        result = await runSpaceDoctor({
          cwd,
          flags,
          skipTests: Boolean(args["skip-tests"]),
        });
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
