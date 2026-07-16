import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultInstallPath,
  installMurrmureSkill,
  legacyInstallPath,
  legacyMonolithInstallPath,
  skillSourceDir,
  SKILL_DIR_NAME,
} from "../src/skill/install.js";

const FDK_PATTERNS = [
  /flow push/i,
  /flow promote/i,
  /evolution-pipeline/,
  /capability-authoring/,
  /workers\.md/,
  /FDK worker/i,
  /mrmr flow validate.*push/s,
];

describe("murrmure skill install", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-skill-install-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("installs agent skill to .cursor/skills/murrmure-agent", () => {
    const result = installMurrmureSkill(targetDir, { variant: "agent" });
    expect(result.ok).toBe(true);
    expect(result.path).toBe(defaultInstallPath(targetDir, "agent"));

    const skillMd = readFileSync(join(result.path, "SKILL.md"), "utf-8");
    expect(skillMd).toMatch(/^name: murrmure-agent/m);
    expect(skillMd).toContain("Runtime MCP");
    expect(skillMd).not.toContain("murrmure-flow");
  });

  test("installs all variants to murrmure-agent and murrmure-developer", () => {
    const result = installMurrmureSkill(targetDir, { variant: "all" });
    expect(result.variant).toBe("all");
    expect(existsSync(defaultInstallPath(targetDir, "agent"))).toBe(true);
    expect(existsSync(defaultInstallPath(targetDir, "developer"))).toBe(true);
    expect(result.installed).toHaveLength(2);
  });

  test("removes stale legacy skill directories on install", () => {
    const legacyPath = legacyInstallPath(targetDir);
    const monolithPath = legacyMonolithInstallPath(targetDir);
    mkdirSync(legacyPath, { recursive: true });
    mkdirSync(monolithPath, { recursive: true });
    writeFileSync(join(legacyPath, "SKILL.md"), "name: murrmure-flow\n");
    writeFileSync(join(monolithPath, "SKILL.md"), "name: murrmure\n");

    installMurrmureSkill(targetDir, { variant: "agent" });

    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(monolithPath)).toBe(false);
    expect(existsSync(defaultInstallPath(targetDir, "agent"))).toBe(true);
  });

  test("skill sources have zero FDK push/evolution references", () => {
    const variants = ["agent", "developer"] as const;
    const files = variants
      .map((variant) => readFileSync(join(skillSourceDir(variant), "SKILL.md"), "utf-8"))
      .join("\n");

    for (const pattern of FDK_PATTERNS) {
      expect(files).not.toMatch(pattern);
    }
  });

  test("SKILL_DIR_NAME is murrmure-agent", () => {
    expect(SKILL_DIR_NAME).toBe("murrmure-agent");
  });
});

describe("skill eval fixtures (advisory)", () => {
  test("six advisory fixtures exist", () => {
    const evalDir = join(import.meta.dirname, "skill-eval");
    const fixtures = ["mcp-setup", "space-apply", "hooks-triggers", "checkpoint-resolve", "orchestration-ab", "known-gaps-honesty"];
    for (const id of fixtures) {
      const raw = readFileSync(join(evalDir, `${id}.json`), "utf-8");
      const fixture = JSON.parse(raw) as { advisory: boolean; expected_keywords: string[] };
      expect(fixture.advisory).toBe(true);
      expect(fixture.expected_keywords.length).toBeGreaterThan(0);
    }
  });
});
