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

  test("flow validate --json on missing path exits 1 with structured errors", () => {
    try {
      execFileSync("node", [cliPath, "flow", "validate", "/nonexistent-flow-path", "--json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect.fail("expected exit code 1");
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { status?: number; stdout?: string; stderr?: string };
      expect(err.status).toBe(1);
      const parsed = JSON.parse(err.stdout?.trim() ?? "{}") as {
        ok: boolean;
        errors?: unknown[];
      };
      expect(parsed.ok).toBe(false);
      expect(Array.isArray(parsed.errors)).toBe(true);
      expect(err.stderr?.trim()).toBe("");
    }
  });
});
