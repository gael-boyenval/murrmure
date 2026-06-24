import type { CommandDef } from "citty";
import { renderUsage } from "citty";
import { describe, expect, test } from "vitest";
import { rootCommand } from "../src/commands/root.js";

type LeafCommand = {
  path: string;
  command: CommandDef;
};

function collectLeaves(command: CommandDef, path: string[] = []): LeafCommand[] {
  const meta = command.meta;
  const name = meta && typeof meta === "object" && "name" in meta ? meta.name : undefined;
  const currentPath = name ? [...path, name] : path;

  if (command.subCommands && Object.keys(command.subCommands).length > 0) {
    const leaves: LeafCommand[] = [];
    for (const sub of Object.values(command.subCommands)) {
      leaves.push(...collectLeaves(sub as CommandDef, currentPath));
    }
    return leaves;
  }

  return [{ path: currentPath.join(" "), command }];
}

function commandDescription(command: CommandDef): string {
  const meta = command.meta;
  if (meta && typeof meta === "object" && "description" in meta) {
    return String(meta.description ?? "");
  }
  return "";
}

describe("help contract (full citty tree)", () => {
  const leaves = collectLeaves(rootCommand as CommandDef);

  test("discovers every leaf command", () => {
    expect(leaves.length).toBeGreaterThan(30);
    const paths = leaves.map((leaf) => leaf.path);
    expect(paths).toContain("mrmr doctor");
    expect(paths).toContain("mrmr flow push");
    expect(paths).toContain("mrmr space grant mint");
  });

  test.each(leaves.map((leaf) => [leaf.path, leaf.command] as const))(
    "%s has description and Requires line",
    async (_path, command) => {
      const description = commandDescription(command);
      expect(description.length).toBeGreaterThan(5);
      expect(description).toMatch(/Requires:/);

      const usage = await renderUsage(command);
      expect(usage.length).toBeGreaterThan(20);
      expect(usage).toMatch(/Requires:/);
    },
  );
});
