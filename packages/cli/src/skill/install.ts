import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR_NAME = "murrmure-flow";

export function skillPackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function skillSourceDir(): string {
  return join(skillPackageRoot(), "skill");
}

export function defaultInstallPath(targetRoot: string): string {
  return join(targetRoot, ".cursor", "skills", SKILL_DIR_NAME);
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
  const dest = defaultInstallPath(targetRoot);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
  return { ok: true, path: dest, version: readSkillVersion() };
}
