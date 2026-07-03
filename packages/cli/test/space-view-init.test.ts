import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertSafeViewId, resolveViewDir, scaffoldViewPackage } from "../src/lib/view-scaffold.js";
import { spaceViewInitCommand } from "../src/commands/space/view-init.js";

describe("space view init scaffold", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-space-view-init-"));
    mkdirSync(join(targetDir, "murrmure"), { recursive: true });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("creates Vite+React view tree with fixtures", () => {
    const created = scaffoldViewPackage(join(targetDir, "murrmure"), "preview-review");
    expect(created.length).toBeGreaterThan(5);

    const viewDir = join(targetDir, "murrmure", "views", "preview-review");
    expect(existsSync(join(viewDir, "package.json"))).toBe(true);
    expect(existsSync(join(viewDir, "src", "App.tsx"))).toBe(true);
    expect(existsSync(join(viewDir, "src", "main.tsx"))).toBe(true);
    expect(existsSync(join(viewDir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(viewDir, "dev", "fixtures", "intake.json"))).toBe(true);
    expect(existsSync(join(viewDir, "dev", "fixtures", "gate-round-1.json"))).toBe(true);
    expect(existsSync(join(viewDir, "dev", "fixtures", "gate-round-2.json"))).toBe(true);
    expect(existsSync(join(viewDir, "view.manifest.yaml"))).toBe(true);
  });

  test("rejects path traversal in view id", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    expect(() => scaffoldViewPackage(murrmureRoot, "../escape")).toThrow(/Invalid view id/);
    expect(() => scaffoldViewPackage(murrmureRoot, "foo/bar")).toThrow(/Invalid view id/);
    expect(() => assertSafeViewId("/etc/passwd")).toThrow(/Invalid view id/);
    expect(() => resolveViewDir(murrmureRoot, "..")).toThrow(/Invalid view id/);
  });

  test("command scaffolds from space root", async () => {
    await (spaceViewInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { id: "my-view", json: true, "space-root": targetDir },
      rawArgs: [],
    });

    const viewDir = join(targetDir, "murrmure", "views", "my-view");
    expect(existsSync(join(viewDir, "package.json"))).toBe(true);
    expect(existsSync(join(viewDir, "src", "App.tsx"))).toBe(true);
  });
});
