import { describe, expect, test } from "vitest";
import { renderUsage } from "citty";
import {
  runtimeAuditExportCommand,
  runtimeCommand,
  runtimeEventsCommand,
  runtimeGatesCommand,
  runtimeTransitionCommand,
  runtimeWaitCommand,
} from "../src/commands/runtime.js";
import { healthCommand } from "../src/commands/health.js";

const RUNTIME_LEAVES = [
  { name: "events", command: runtimeEventsCommand, requires: "valid token for <space>" },
  { name: "gates", command: runtimeGatesCommand, requires: "valid token for <space>" },
  { name: "transition", command: runtimeTransitionCommand, requires: "valid token for <space>" },
  { name: "wait", command: runtimeWaitCommand, requires: "valid token for <space>" },
  {
    name: "audit export",
    command: runtimeAuditExportCommand,
    requires: "valid token for <space>",
  },
] as const;

describe("runtime command help", () => {
  test("runtime group usage lists all subcommands", async () => {
    const usage = await renderUsage(runtimeCommand);
    expect(usage).toContain("events");
    expect(usage).toContain("gates");
    expect(usage).toContain("transition");
    expect(usage).toContain("wait");
    expect(usage).toContain("audit");
  });

  test.each(RUNTIME_LEAVES)("$name --help includes Requires line", async ({ command, requires }) => {
    const usage = await renderUsage(command);
    expect(usage.length).toBeGreaterThan(20);
    expect(usage).toMatch(/Requires:/);
    expect(usage).toContain(requires);
  });

  test("events help mentions typical scopes advisory", async () => {
    const usage = await renderUsage(runtimeEventsCommand);
    expect(usage).toMatch(/Typical scopes: event:read/);
  });

  test("health --help includes Requires: none", async () => {
    const usage = await renderUsage(healthCommand);
    expect(usage).toMatch(/Requires: none/);
  });
});
