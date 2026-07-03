import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultInstallPath,
  installMurrmureSkill,
  legacyInstallPath,
  skillSourceDir,
  SKILL_DIR_NAME,
} from "../src/skill/install.js";

const REFERENCE_FILES = [
  "platform-model.md",
  "known-gaps.md",
  "cli.md",
  "mcp.md",
  "grants.md",
  "space-directory.md",
  "flow-authoring.md",
  "actions-executors.md",
  "hooks-triggers.md",
  "views.md",
  "gates.md",
  "orchestration-attach.md",
  "federation.md",
  "troubleshooting.md",
  "wizards.md",
] as const;

const DELETED_REFERENCE_FILES = [
  "evolution-pipeline.md",
  "capability-authoring.md",
  "workers.md",
] as const;

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

  test("installs to .cursor/skills/murrmure with correct frontmatter", () => {
    const result = installMurrmureSkill(targetDir);
    expect(result.ok).toBe(true);
    expect(result.path).toBe(defaultInstallPath(targetDir));

    const skillMd = readFileSync(join(result.path, "SKILL.md"), "utf-8");
    expect(skillMd).toMatch(/^name: murrmure/m);
    expect(skillMd).toContain("Task router");
    expect(skillMd).not.toContain("murrmure-flow");
  });

  test("removes stale murrmure-flow directory on install", () => {
    const legacyPath = legacyInstallPath(targetDir);
    mkdirSync(legacyPath, { recursive: true });
    writeFileSync(join(legacyPath, "SKILL.md"), "name: murrmure-flow\n");

    installMurrmureSkill(targetDir);

    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(defaultInstallPath(targetDir))).toBe(true);
  });

  test("reinstall removes deleted bundled reference files from prior install", () => {
    const dest = defaultInstallPath(targetDir);
    installMurrmureSkill(targetDir);

    for (const file of DELETED_REFERENCE_FILES) {
      writeFileSync(join(dest, "reference", file), `# stale ${file}\n`);
    }

    installMurrmureSkill(targetDir);

    for (const file of DELETED_REFERENCE_FILES) {
      expect(
        existsSync(join(dest, "reference", file)),
        `stale reference/${file} should be removed on reinstall`,
      ).toBe(false);
    }
    for (const file of REFERENCE_FILES) {
      expect(existsSync(join(dest, "reference", file)), `reference/${file} should remain`).toBe(
        true,
      );
    }
  });

  test("reference inventory matches phase 07 spec", () => {
    const refDir = join(skillSourceDir(), "reference");
    for (const file of REFERENCE_FILES) {
      expect(existsSync(join(refDir, file)), `missing reference/${file}`).toBe(true);
    }
    for (const file of DELETED_REFERENCE_FILES) {
      expect(existsSync(join(refDir, file)), `legacy reference/${file} should be deleted`).toBe(
        false,
      );
    }
  });

  test("skill tree has zero FDK push/evolution references", () => {
    const skillRoot = skillSourceDir();
    const files = [
      readFileSync(join(skillRoot, "SKILL.md"), "utf-8"),
      ...REFERENCE_FILES.map((f) =>
        readFileSync(join(skillRoot, "reference", f), "utf-8"),
      ),
    ].join("\n");

    for (const pattern of FDK_PATTERNS) {
      expect(files).not.toMatch(pattern);
    }
  });

  test("SKILL_DIR_NAME is murrmure", () => {
    expect(SKILL_DIR_NAME).toBe("murrmure");
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
