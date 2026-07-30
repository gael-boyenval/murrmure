import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { colors } from "consola/utils";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import {
  installViewDependencies,
  resolveMurrmureRootFromCwd,
  resolveViewDir,
  scaffoldViewPackage,
} from "../../lib/view-scaffold.js";

export const spaceViewInitCommand = defineCommand({
  meta: {
    name: "init",
    description: "Scaffold .mrmr/views/{id}/ Vite+React view package (Requires: none)",
  },
  args: {
    ...globalArgs,
    id: {
      type: "positional",
      description: "View id (e.g. preview-review)",
      required: true,
    },
    "space-root": {
      type: "string",
      description: "Space root containing .mrmr/ (default: cwd)",
    },
    "skip-install": {
      type: "boolean",
      description: "Skip npm install after scaffolding",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const viewId = typeof args.id === "string" ? args.id : undefined;
    if (!viewId) {
      printErr("MISSING_ARG", "View id required — run `mrmr space view init <id>`");
    }

    try {
      const spaceRootArg =
        typeof args["space-root"] === "string" && args["space-root"]
          ? resolve(args["space-root"])
          : undefined;
      const murrmureRoot = resolveMurrmureRootFromCwd(process.cwd(), spaceRootArg);
      const created = scaffoldViewPackage(murrmureRoot, viewId);
      const viewDir = resolveViewDir(murrmureRoot, viewId);
      const skipInstall = Boolean(args["skip-install"]) || isJsonMode() || flags.json;

      let installed = false;
      if (!skipInstall) {
        cliConsola.info(`Installing dependencies in .mrmr/views/${viewId} …`);
        installViewDependencies(viewDir);
        installed = true;
      }

      if (isJsonMode() || flags.json) {
        printOk({ view_id: viewId, created, installed });
        return;
      }

      printOk({}, `✓ Created view '${viewId}' (${created.length} files)`);
      if (installed) {
        cliConsola.success(colors.green("✓ npm install complete"));
      }

      cliConsola.info(colors.bold("Next — stay at the linked space root:"));
      cliConsola.log(`  ${colors.cyan(`mrmr view dev ${viewId}`)}`);
      cliConsola.log(
        `  ${colors.cyan(`npm run build --prefix .mrmr/views/${viewId}`)} ${colors.dim("&&")} ${colors.cyan("mrmr space apply")}`,
      );
      if (skipInstall) {
        cliConsola.log(
          `  ${colors.dim("(deps not installed)")} ${colors.cyan(`npm install --prefix .mrmr/views/${viewId}`)}`,
        );
      }
    } catch (error) {
      printErr("SCAFFOLD_FAILED", error instanceof Error ? error.message : "View scaffold failed");
    }
  },
}) as CommandDef;
