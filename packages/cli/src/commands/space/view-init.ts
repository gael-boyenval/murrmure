import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { resolveMurrmureRootFromCwd, scaffoldViewPackage } from "../../lib/view-scaffold.js";

export const spaceViewInitCommand = defineCommand({
  meta: {
    name: "init",
    description: "Scaffold murrmure/views/{id}/ Vite+React view package (Requires: none)",
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
      description: "Space root containing murrmure/ (default: cwd)",
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
      if (isJsonMode() || flags.json) {
        printOk({ view_id: viewId, created });
        return;
      }
      printOk({}, `✓ Created view '${viewId}' (${created.length} files)`);
      console.log("Next:");
      console.log(`  cd murrmure/views/${viewId} && npm install`);
      console.log(`  mrmr view dev ${viewId}`);
      console.log("  npm run build && mrmr space apply");
    } catch (error) {
      printErr("SCAFFOLD_FAILED", error instanceof Error ? error.message : "View scaffold failed");
    }
  },
}) as CommandDef;
