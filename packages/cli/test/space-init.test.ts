import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isMurrmureDirEmpty, scaffoldMurrmureDir } from "../src/lib/space-scaffold.js";
import { spaceInitCommand } from "../src/commands/space/init.js";
import { defaultInstallPath } from "../src/skill/install.js";

describe("space init scaffold", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-space-init-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("creates murrmure/ template tree", async () => {
    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true },
      rawArgs: [],
    });
    expect(existsSync(join(targetDir, "murrmure", "actions.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, "murrmure", "flows", "example", "flow.manifest.yaml"))).toBe(true);
  });

  test("scaffolds into an existing empty murrmure/ directory", async () => {
    mkdirSync(join(targetDir, "murrmure"), { recursive: true });
    expect(isMurrmureDirEmpty(join(targetDir, "murrmure"))).toBe(true);

    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true },
      rawArgs: [],
    });

    expect(existsSync(join(targetDir, "murrmure", "space.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, "murrmure", "flows", "example", "flow.manifest.yaml"))).toBe(true);
  });

  test("rejects murrmure/ that already has files", () => {
    mkdirSync(join(targetDir, "murrmure"), { recursive: true });
    writeFileSync(join(targetDir, "murrmure", "actions.yaml"), "version: 1\nactions: {}\n");

    expect(() => scaffoldMurrmureDir(targetDir)).toThrow(/already exists/);
  });

  test("installs skill when --with-skill is passed", async () => {
    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "with-skill": true },
      rawArgs: [],
    });

    expect(existsSync(join(defaultInstallPath(targetDir), "SKILL.md"))).toBe(true);
  });

  test("skips skill prompt when stdin is not a TTY", async () => {
    const isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });

    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir },
      rawArgs: [],
    });

    expect(existsSync(join(defaultInstallPath(targetDir), "SKILL.md"))).toBe(false);

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: isTTY });
  });
});
