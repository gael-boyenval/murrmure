import { defineCommand, type CommandDef } from "citty";
import { globalArgs, parseGlobalFlags } from "./flags.js";
import { printStubMessage } from "./output.js";

export function stubCommand(
  name: string,
  description: string,
  requires?: string,
  qualifiedPath?: string,
): CommandDef {
  const commandPath = qualifiedPath ?? `mrmr ${name}`;
  return defineCommand({
    meta: {
      name,
      description: requires ? `${description} (Requires: ${requires})` : description,
    },
    args: globalArgs,
    run({ args }) {
      parseGlobalFlags(args);
      printStubMessage(commandPath);
    },
  }) as CommandDef;
}

export function stubGroup(
  name: string,
  description: string,
  leaves: Record<string, { description: string; requires?: string }>,
  groupPath: string,
): CommandDef {
  const subCommands: Record<string, CommandDef> = {};
  for (const [leafName, meta] of Object.entries(leaves)) {
    subCommands[leafName] = stubCommand(
      leafName,
      meta.description,
      meta.requires,
      `${groupPath} ${leafName}`,
    );
  }
  return defineCommand({
    meta: { name, description },
    subCommands,
  });
}
