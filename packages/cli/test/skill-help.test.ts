import { describe, expect, test } from "vitest";
import { renderUsage } from "citty";
import {
  skillCommand,
  skillInstallCommand,
  skillUpdateCommand,
  skillVersionCommand,
} from "../src/commands/skill.js";

const SKILL_LEAVES = [
  { name: "install", command: skillInstallCommand },
  { name: "update", command: skillUpdateCommand },
  { name: "version", command: skillVersionCommand },
] as const;

describe("skill command help", () => {
  test("skill group usage lists all subcommands", async () => {
    const usage = await renderUsage(skillCommand);
    for (const leaf of SKILL_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(SKILL_LEAVES)("$name --help includes Requires: none", async ({ command }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:\s*none/);
  });
});
