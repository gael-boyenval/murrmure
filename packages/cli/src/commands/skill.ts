import { resolve } from "node:path";
import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { formatSkillHuman } from "../lib/flow-formatters.js";
import { emitFlowResult } from "../lib/flow-output.js";
import {
  defaultInstallPath,
  installMurrmureSkill,
  readSkillVersion,
} from "../skill/install.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

export const skillInstallCommand = defineCommand({
  meta: {
    name: "install",
    description: `Install murrmure Cursor skill ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    dir: {
      type: "string",
      description: "Target repo root (default: cwd)",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    try {
      const result = installMurrmureSkill(target);
      emitFlowResult(
        {
          ...result,
          command: "install",
          message: `Installed murrmure skill to ${result.path}`,
        },
        formatSkillHuman,
      );
    } catch (error) {
      emitFlowResult({
        ok: false,
        code: "SKILL_INSTALL_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
}) as CommandDef;

export const skillUpdateCommand = defineCommand({
  meta: {
    name: "update",
    description: `Update murrmure Cursor skill ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    dir: {
      type: "string",
      description: "Target repo root (default: cwd)",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    try {
      const result = installMurrmureSkill(target);
      emitFlowResult(
        {
          ...result,
          command: "update",
          message: `Updated murrmure skill to v${result.version}`,
        },
        formatSkillHuman,
      );
    } catch (error) {
      emitFlowResult({
        ok: false,
        code: "SKILL_UPDATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
}) as CommandDef;

export const skillVersionCommand = defineCommand({
  meta: {
    name: "version",
    description: `Show bundled skill version ${requiresLine("none")}`,
  },
  args: {
    ...globalArgs,
    dir: {
      type: "string",
      description: "Target repo root for install path hint (default: cwd)",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    emitFlowResult(
      {
        ok: true,
        command: "version",
        version: readSkillVersion(),
        install_path: defaultInstallPath(target),
      },
      formatSkillHuman,
    );
  },
}) as CommandDef;

export const skillCommand = defineCommand({
  meta: { name: "skill", description: "Murrmure agent skill package" },
  subCommands: {
    install: skillInstallCommand,
    update: skillUpdateCommand,
    version: skillVersionCommand,
  },
});
