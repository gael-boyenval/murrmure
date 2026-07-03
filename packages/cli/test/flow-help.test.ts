import { describe, expect, test } from "vitest";
import { renderUsage } from "citty";
import { flowCommand } from "../src/commands/flow/index.js";
import {
  flowDoctorCommand,
  flowListCommand,
  flowStatusCommand,
} from "../src/commands/flow/commands.js";
import { flowRunCommand } from "../src/commands/flow/run.js";

const FLOW_LEAVES = [
  { name: "run", command: flowRunCommand, requires: "flow:run" },
  { name: "status", command: flowStatusCommand, requires: "space:read" },
  { name: "list", command: flowListCommand, requires: "space:read" },
  { name: "doctor", command: flowDoctorCommand, requires: "any valid token" },
] as const;

describe("flow command help", () => {
  test("flow group usage lists v2 subcommands only", async () => {
    const usage = await renderUsage(flowCommand);
    for (const leaf of FLOW_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
    expect(usage).not.toContain("push");
    expect(usage).not.toContain("build");
  });

  test.each(FLOW_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});
