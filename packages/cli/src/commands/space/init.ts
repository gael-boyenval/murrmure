import * as p from "@clack/prompts";
import { defineCommand, type CommandDef } from "citty";
import { resolve } from "node:path";
import { globalArgs, parseGlobalFlags } from "../../lib/flags.js";
import { cliConsola, isJsonMode, printErr, printOk } from "../../lib/output.js";
import { scaffoldMurrmureDir } from "../../lib/space-scaffold.js";
import { installMurrmureSkill } from "../../skill/install.js";

async function maybeInstallSkill(
  target: string,
  options: { withSkill: boolean; noSkill: boolean },
): Promise<{ installed: boolean; path?: string; version?: string }> {
  if (options.noSkill) {
    return { installed: false };
  }

  let shouldInstall = options.withSkill;
  if (!shouldInstall && !isJsonMode() && process.stdin.isTTY) {
    const answer = await p.confirm({
      message: "Install murrmure Cursor skill in this repo?",
      initialValue: true,
    });
    if (p.isCancel(answer)) {
      p.cancel("Skill install skipped");
      return { installed: false };
    }
    shouldInstall = Boolean(answer);
  }

  if (!shouldInstall) {
    return { installed: false };
  }

  const result = installMurrmureSkill(target);
  return { installed: true, path: result.path, version: result.version };
}

async function resolveWithExamples(options: {
  withExamples: boolean;
  noExamples: boolean;
}): Promise<boolean> {
  if (options.noExamples) {
    return false;
  }
  if (options.withExamples) {
    return true;
  }
  if (!isJsonMode() && process.stdin.isTTY) {
    const answer = await p.confirm({
      message: "Include example flow and starter files?",
      initialValue: false,
    });
    if (p.isCancel(answer)) {
      p.cancel("Scaffold cancelled");
      return false;
    }
    return Boolean(answer);
  }
  return false;
}

export const spaceInitCommand = defineCommand({
  meta: {
    name: "init",
    description: "Scaffold .mrmr/ space directory in the current folder (Requires: none)",
  },
  args: {
    ...globalArgs,
    path: {
      type: "string",
      description: "Target directory (default: .)",
    },
    "with-skill": {
      type: "boolean",
      description: "Install murrmure Cursor skill without prompting",
      default: false,
    },
    "no-skill": {
      type: "boolean",
      description: "Skip skill install prompt",
      default: false,
    },
    "with-examples": {
      type: "boolean",
      description: "Scaffold example flow and starter README without prompting",
      default: false,
    },
    "no-examples": {
      type: "boolean",
      description: "Skip example flow (empty handlers only)",
      default: false,
    },
  },
  async run({ args }) {
    const flags = parseGlobalFlags(args);
    const target = resolve(typeof args.path === "string" && args.path ? args.path : process.cwd());
    const withSkill = Boolean(args["with-skill"]);
    const noSkill = Boolean(args["no-skill"]);
    const withExamples = Boolean(args["with-examples"]);
    const noExamples = Boolean(args["no-examples"]);

    if (withSkill && noSkill) {
      printErr("USAGE", "Pass only one of --with-skill or --no-skill");
    }
    if (withExamples && noExamples) {
      printErr("USAGE", "Pass only one of --with-examples or --no-examples");
    }

    try {
      const includeExamples = await resolveWithExamples({ withExamples, noExamples });
      const { created, filledEmptyMurrmure } = scaffoldMurrmureDir(target, {
        withExamples: includeExamples,
      });
      const skill = await maybeInstallSkill(target, { withSkill, noSkill });

      if (isJsonMode() || flags.json) {
        printOk({
          created,
          murrmure_root: `${target}/.mrmr`,
          filled_empty_murrmure: filledEmptyMurrmure,
          with_examples: includeExamples,
          skill_installed: skill.installed,
          skill_path: skill.path,
          skill_version: skill.version,
        });
        return;
      }

      const verb = filledEmptyMurrmure ? "Scaffolded empty" : "Created";
      printOk({}, `✓ ${verb} .mrmr/ (${created.length} files)`);
      if (skill.installed) {
        cliConsola.success(`Installed murrmure skill to ${skill.path} (v${skill.version})`);
      }
      console.log(
        "Next: run `mrmr space link --path . --create`, `mrmr space apply`, then `mrmr grant mint --space <spc_…>` to connect MCP.",
      );
    } catch (error) {
      printErr("SCAFFOLD_FAILED", error instanceof Error ? error.message : "Scaffold failed");
    }
  },
}) as CommandDef;
