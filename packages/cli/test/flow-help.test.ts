import { describe, expect, test } from "vitest";
import { renderUsage } from "citty";
import { flowCommand } from "../src/commands/flow/index.js";
import {
  flowApplyCommand,
  flowBuildCommand,
  flowDevCommand,
  flowDoctorCommand,
  flowInitCommand,
  flowListCommand,
  flowPromoteCommand,
  flowPushCommand,
  flowRollbackCommand,
  flowStatusCommand,
  flowTestCommand,
  flowValidateCommand,
} from "../src/commands/flow/commands.js";

const FLOW_LEAVES = [
  { name: "init", command: flowInitCommand, requires: "none" },
  { name: "validate", command: flowValidateCommand, requires: "none" },
  { name: "build", command: flowBuildCommand, requires: "none" },
  { name: "push", command: flowPushCommand, requires: "flow:install" },
  { name: "status", command: flowStatusCommand, requires: "none" },
  { name: "list", command: flowListCommand, requires: "space:read" },
  { name: "doctor", command: flowDoctorCommand, requires: "any valid token" },
  { name: "test", command: flowTestCommand, requires: "flow:install" },
  { name: "promote", command: flowPromoteCommand, requires: "flow:install" },
  { name: "apply", command: flowApplyCommand, requires: "flow:install" },
  { name: "rollback", command: flowRollbackCommand, requires: "flow:install" },
  { name: "dev", command: flowDevCommand, requires: "none" },
] as const;

describe("flow command help", () => {
  test("flow group usage lists all subcommands", async () => {
    const usage = await renderUsage(flowCommand);
    for (const leaf of FLOW_LEAVES) {
      expect(usage).toContain(leaf.name);
    }
  });

  test.each(FLOW_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });
});
