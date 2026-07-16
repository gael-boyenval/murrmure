import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultInstallPath,
  installMurrmureSkill,
  legacyInstallPath,
  legacyMonolithInstallPath,
  resolveSkillInstallVariant,
} from "../src/skill/install.js";

describe("skill install variants", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-skill-variants-"));
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("installs agent variant only", () => {
    const result = installMurrmureSkill(targetDir, { variant: "agent" });
    expect(result.variant).toBe("agent");
    expect(existsSync(defaultInstallPath(targetDir, "agent"))).toBe(true);
    expect(existsSync(defaultInstallPath(targetDir, "developer"))).toBe(false);
  });

  test("installs developer variant only", () => {
    const result = installMurrmureSkill(targetDir, { variant: "developer" });
    expect(result.variant).toBe("developer");
    expect(existsSync(defaultInstallPath(targetDir, "developer"))).toBe(true);
    expect(existsSync(defaultInstallPath(targetDir, "agent"))).toBe(false);
  });

  test("installs all variants", () => {
    const result = installMurrmureSkill(targetDir, { variant: "all" });
    expect(result.variant).toBe("all");
    expect(existsSync(defaultInstallPath(targetDir, "agent"))).toBe(true);
    expect(existsSync(defaultInstallPath(targetDir, "developer"))).toBe(true);
  });

  test("default variant is agent for worker spaces", () => {
    mkdirSync(join(targetDir, ".mrmr", "space"), { recursive: true });
    expect(resolveSkillInstallVariant(targetDir)).toBe("agent");
  });

  test("default variant is all when local flows are present", () => {
    mkdirSync(join(targetDir, ".mrmr", "flows", "demo"), { recursive: true });
    writeFileSync(
      join(targetDir, ".mrmr", "flows", "demo", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: demo\nstart:\n  manual: true\nsteps: []\n",
      "utf-8",
    );
    expect(resolveSkillInstallVariant(targetDir)).toBe("all");
  });

  test("install removes legacy skill directories", () => {
    const legacyFdk = legacyInstallPath(targetDir);
    const legacyMonolith = legacyMonolithInstallPath(targetDir);
    mkdirSync(legacyFdk, { recursive: true });
    mkdirSync(legacyMonolith, { recursive: true });
    writeFileSync(join(legacyFdk, "SKILL.md"), "name: murrmure-flow\n", "utf-8");
    writeFileSync(join(legacyMonolith, "SKILL.md"), "name: murrmure\n", "utf-8");

    installMurrmureSkill(targetDir, { variant: "agent" });

    expect(existsSync(legacyFdk)).toBe(false);
    expect(existsSync(legacyMonolith)).toBe(false);
  });
});
