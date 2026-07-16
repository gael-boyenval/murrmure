import { resolve } from "node:path";
import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "../lib/flags.js";
import { formatSkillHuman } from "../lib/flow-formatters.js";
import { emitFlowResult } from "../lib/flow-output.js";
import {
  defaultInstallPath,
  installMurrmureSkill,
  resolveSkillInstallVariant,
  type SkillInstallVariant,
  readSkillVersion,
} from "../skill/install.js";

function requiresLine(scope: string): string {
  return `(Requires: ${scope})`;
}

function parseVariant(value: unknown): SkillInstallVariant | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim();
  if (raw === "agent" || raw === "developer" || raw === "all") return raw;
  throw new Error(`Invalid --variant '${raw}'. Expected: agent, developer, all`);
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
    variant: {
      type: "string",
      description: "Skill variant: agent | developer | all (default: archetype based)",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    try {
      const variant = parseVariant(args.variant);
      const result = installMurrmureSkill(target, { variant });
      const resolved = resolveSkillInstallVariant(target, variant);
      emitFlowResult(
        {
          ...result,
          command: "install",
          variant: resolved,
          install_path: defaultInstallPath(target, "agent"),
          message: `Installed murrmure ${resolved} skill variant`,
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
    variant: {
      type: "string",
      description: "Skill variant: agent | developer | all (default: archetype based)",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    try {
      const variant = parseVariant(args.variant);
      const result = installMurrmureSkill(target, { variant });
      const resolved = resolveSkillInstallVariant(target, variant);
      emitFlowResult(
        {
          ...result,
          command: "update",
          variant: resolved,
          install_path: defaultInstallPath(target, "agent"),
          message: `Updated murrmure ${resolved} skill variant`,
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
    variant: {
      type: "string",
      description: "Optional variant: agent | developer",
    },
  },
  run({ args }) {
    parseGlobalFlags(args);
    const target = typeof args.dir === "string" ? resolve(args.dir) : process.cwd();
    const variantRaw = args.variant;
    if (variantRaw && variantRaw !== "agent" && variantRaw !== "developer") {
      emitFlowResult({
        ok: false,
        code: "SKILL_VERSION_FAILED",
        message: `Invalid --variant '${String(variantRaw)}'. Expected: agent or developer`,
      });
      return;
    }
    const variant = (variantRaw as "agent" | "developer" | undefined) ?? "agent";
    emitFlowResult(
      {
        ok: true,
        command: "version",
        variant,
        version: readSkillVersion(variant),
        install_path: defaultInstallPath(target, variant),
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
