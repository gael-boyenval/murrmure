import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultInstallPath, installStudioSkill } from "../src/install.js";

describe("installStudioSkill", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "studio-skill-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("copies SKILL.md and reference files", () => {
    const { path, version } = installStudioSkill(dir);
    expect(path).toBe(defaultInstallPath(dir));
    expect(existsSync(join(path, "SKILL.md"))).toBe(true);
    expect(existsSync(join(path, "reference", "evolution-pipeline.md"))).toBe(true);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const skill = readFileSync(join(path, "SKILL.md"), "utf-8");
    expect(skill).toContain("studio-capability");
    expect(skill).toContain("evolution-pipeline");
  });
});
