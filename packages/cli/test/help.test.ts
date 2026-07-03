import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderUsage } from "citty";
import { rootCommand } from "../src/commands/root.js";

const TOP_LEVEL_GROUPS = [
  "login",
  "logout",
  "whoami",
  "doctor",
  "health",
  "space",
  "hub",
  "runtime",
  "flow",
  "skill",
] as const;

const cliPath = join(import.meta.dirname, "..", "dist", "cli.js");

describe("CLI help contract", () => {
  test("root usage lists all planned top-level groups", async () => {
    const usage = await renderUsage(rootCommand);
    for (const group of TOP_LEVEL_GROUPS) {
      expect(usage).toContain(group);
    }
  });

  test("root usage documents global flags", async () => {
    const usage = await renderUsage(rootCommand);
    expect(usage).toMatch(/--json/);
    expect(usage).toMatch(/--space/);
    expect(usage).toMatch(/--hub-url/);
    expect(usage).toMatch(/--token/);
  });

  test("unknown flow subcommand exits non-zero", () => {
    try {
      execFileSync("node", [cliPath, "flow", "push", "--json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect.fail("expected exit code non-zero");
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { status?: number };
      expect(err.status).not.toBe(0);
    }
  });
});
