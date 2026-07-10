import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import {
  type FlowScaffoldTemplate,
  scaffoldFlowPackage,
} from "../../lib/flow-scaffold.js";
import { isJsonMode, printErr, printOk } from "../../lib/output.js";
import { resolveMurrmureRootFromCwd } from "../../lib/view-scaffold.js";

const TEMPLATES: FlowScaffoldTemplate[] = ["hello-gate", "hello-invoke"];

function parseTemplate(value: unknown): FlowScaffoldTemplate {
  const raw = typeof value === "string" ? value : "hello-gate";
  if (!TEMPLATES.includes(raw as FlowScaffoldTemplate)) {
    throw new Error(`Unknown template '${raw}' — use hello-gate or hello-invoke`);
  }
  return raw as FlowScaffoldTemplate;
}

export const spaceFlowInitCommand = defineCommand({
  meta: {
    name: "init",
    description:
      "Scaffold .mrmr flow stack (manifest, actions, scripts, views) (Requires: .mrmr/)",
  },
  args: {
    ...globalArgs,
    id: {
      type: "positional",
      description: "Flow id (e.g. preview-review)",
      required: true,
    },
    template: {
      type: "string",
      description: "Scaffold template (hello-gate | hello-invoke)",
      default: "hello-gate",
    },
    "space-root": {
      type: "string",
      description: "Space root containing .mrmr/ (default: cwd)",
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const flowId = typeof args.id === "string" ? args.id : undefined;
    if (!flowId) {
      printErr("MISSING_ARG", "Flow id required — run `mrmr space flow init <id>`");
    }

    try {
      const template = parseTemplate(args.template);
      const spaceRootArg =
        typeof args["space-root"] === "string" && args["space-root"]
          ? resolve(args["space-root"])
          : undefined;
      const murrmureRoot = resolveMurrmureRootFromCwd(process.cwd(), spaceRootArg);
      const created = scaffoldFlowPackage(murrmureRoot, flowId, template);

      if (isJsonMode() || flags.json) {
        printOk({ flow_id: flowId, template, created });
        return;
      }

      printOk({}, `✓ Created flow '${flowId}' (${template}, ${created.length} files touched)`);
      console.log("Next:");
      if (template === "hello-gate") {
        console.log(`  cd .mrmr/views/${flowId} && npm install && npm run build`);
        console.log(`  cd ../${flowId}-intake && npm install && npm run build`);
      }
      console.log("  mrmr space apply --strict");
      if (template === "hello-gate") {
        const slug = `flows_${flowId}`.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
        console.log(`  mrmr flow run flw_${slug}`);
      }
    } catch (error) {
      printErr("SCAFFOLD_FAILED", error instanceof Error ? error.message : "Flow scaffold failed");
    }
  },
}) as CommandDef;
