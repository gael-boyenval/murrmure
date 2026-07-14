import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { printOk } from "../../lib/output.js";
import { runSetupWizard } from "../setup.js";

export const spaceSetupCommand = defineCommand({
  meta: {
    name: "setup",
    description: "Create, scaffold, link, and apply one named space (Requires: space:admin)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Project root for .mrmr/ scaffold (default: .)",
    },
    name: {
      type: "string",
      description: "Space display name (default: project folder name)",
    },
    slug: {
      type: "string",
      description: "Space slug (default: normalized display name)",
    },
    yes: {
      type: "boolean",
      description: "Non-interactive — accept defaults",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const result = await runSetupWizard({
      projectPath: resolve(typeof args.path === "string" && args.path ? args.path : process.cwd()),
      flags,
      yes: Boolean(args.yes),
      json: flags.json,
      name: typeof args.name === "string" ? args.name : undefined,
      slug: typeof args.slug === "string" ? args.slug : undefined,
    });
    if (flags.json) {
      printOk(result as unknown as Record<string, unknown>);
    }
    if (!result.ok) {
      process.exit(1);
    }
  },
}) as CommandDef;
