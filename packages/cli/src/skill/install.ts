import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { cliPackageRoot, cliResourcePath } from "../lib/cli-package-root.js";

export const LEGACY_SKILL_DIR_NAME = "murrmure-flow";
export const SKILL_DIR_NAME = "murrmure";

export function skillPackageRoot(): string {
  return cliPackageRoot();
}

export function skillSourceDir(): string {
  return cliResourcePath("skill");
}

export function defaultInstallPath(targetRoot: string): string {
  return join(targetRoot, ".cursor", "skills", SKILL_DIR_NAME);
}

export function legacyInstallPath(targetRoot: string): string {
  return join(targetRoot, ".cursor", "skills", LEGACY_SKILL_DIR_NAME);
}

export function readSkillVersion(): string {
  const versionPath = join(skillPackageRoot(), "VERSION");
  if (!existsSync(versionPath)) return "0.0.0";
  return readFileSync(versionPath, "utf-8").trim();
}

export function installMurrmureSkill(targetRoot: string = process.cwd()): {
  ok: true;
  path: string;
  version: string;
} {
  const source = skillSourceDir();
  if (!existsSync(join(source, "SKILL.md"))) {
    throw new Error(`Skill source missing at ${source}`);
  }

  const legacyDest = legacyInstallPath(targetRoot);
  if (existsSync(legacyDest)) {
    rmSync(legacyDest, { recursive: true, force: true });
  }

  const dest = defaultInstallPath(targetRoot);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
  return { ok: true, path: dest, version: readSkillVersion() };
}
