import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { isMurrmureDirEmpty, scaffoldMurrmureDir } from "../src/lib/space-scaffold.js";
import { spaceInitCommand } from "../src/commands/space/init.js";
import { defaultInstallPath } from "../src/skill/install.js";

describe("space init scaffold", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-space-init-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("creates empty .mrmr/ template tree by default", async () => {
    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true },
      rawArgs: [],
    });
    expect(existsSync(join(targetDir, ".mrmr", "space", "handlers.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, ".mrmr", "space", "actions.yaml"))).toBe(false);
    expect(existsSync(join(targetDir, ".mrmr", "flows", "example", "flow.manifest.yaml"))).toBe(false);
    expect(existsSync(join(targetDir, ".mrmr", "README.md"))).toBe(false);
    expect(existsSync(join(targetDir, ".cursor", "mcp.json"))).toBe(false);
  });

  test("creates example flow when --with-examples is passed", async () => {
    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true, "with-examples": true },
      rawArgs: [],
    });
    expect(existsSync(join(targetDir, ".mrmr", "flows", "example", "flow.manifest.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, ".mrmr", "README.md"))).toBe(true);
  });

  test("scaffolds into an existing empty .mrmr/ directory", async () => {
    mkdirSync(join(targetDir, ".mrmr"), { recursive: true });
    expect(isMurrmureDirEmpty(join(targetDir, ".mrmr"))).toBe(true);

    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true },
      rawArgs: [],
    });

    expect(existsSync(join(targetDir, ".mrmr", "space", "space.yaml"))).toBe(true);
    expect(existsSync(join(targetDir, ".mrmr", "flows", "example", "flow.manifest.yaml"))).toBe(false);
  });

  test("scaffoldMurrmureDir can include example flow", () => {
    const { created } = scaffoldMurrmureDir(targetDir, { withExamples: true });
    expect(created.some((path) => path.endsWith("flows/example/flow.manifest.yaml"))).toBe(true);
  });

  test("scaffoldMurrmureDir rejects .mrmr/ that already has files", () => {
    mkdirSync(join(targetDir, ".mrmr", "space"), { recursive: true });
    writeFileSync(join(targetDir, ".mrmr", "space", "handlers.yaml"), "version: 1\nhandlers: []\n");

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

  test("runs offline, defaults identity from the folder, and creates no credential", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("space init must not contact the Hub");
    });
    vi.stubGlobal("fetch", fetchMock);

    await (spaceInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { path: targetDir, json: true, "no-skill": true, "no-examples": true },
      rawArgs: [],
    });

    const manifest = parseYaml(
      readFileSync(join(targetDir, ".mrmr", "space", "space.yaml"), "utf-8"),
    ) as { name: string; slug: string; link?: unknown };
    const folder = targetDir.split("/").at(-1)!;
    expect(manifest.name).toBe(folder);
    expect(manifest.slug).toBe(
      folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, ""),
    );
    expect(manifest.link).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(join(targetDir, ".cursor", "mcp.json"))).toBe(false);
  });
});
