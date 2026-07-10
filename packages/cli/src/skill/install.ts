import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { cliPackageRoot, cliResourcePath } from "../lib/cli-package-root.js";

export const LEGACY_SKILL_DIR_NAME = "murrmure-flow";
export const LEGACY_MONOLITH_SKILL_DIR_NAME = "murrmure";
export const SKILL_AGENT_DIR_NAME = "murrmure-agent";
export const SKILL_DEVELOPER_DIR_NAME = "murrmure-developer";
export const SKILL_DIR_NAME = SKILL_AGENT_DIR_NAME;

export type SkillInstallVariant = "agent" | "developer" | "all";

export interface InstalledSkill {
  variant: Exclude<SkillInstallVariant, "all">;
  path: string;
  version: string;
}

export interface InstallMurrmureSkillResult {
  ok: true;
  variant: SkillInstallVariant;
  path: string;
  version: string;
  installed: InstalledSkill[];
}

const SKILL_DIRS: Record<Exclude<SkillInstallVariant, "all">, string> = {
  agent: SKILL_AGENT_DIR_NAME,
  developer: SKILL_DEVELOPER_DIR_NAME,
};

const SKILL_SOURCE_DIRS: Record<Exclude<SkillInstallVariant, "all">, string> = {
  agent: "skill-agent",
  developer: "skill-developer",
};

function hasManifestInChildren(dir: string, filename: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir)) {
    const child = join(dir, entry);
    if (!statSync(child).isDirectory()) continue;
    if (existsSync(join(child, filename))) {
      return true;
    }
  }
  return false;
}

export function hasLocalAuthoringContent(targetRoot: string): boolean {
  const murrmureRoot = join(targetRoot, ".mrmr");
  const flowsDir = join(murrmureRoot, "flows");
  const viewsDir = join(murrmureRoot, "views");
  return (
    hasManifestInChildren(flowsDir, "flow.manifest.yaml") ||
    hasManifestInChildren(viewsDir, "view.manifest.yaml")
  );
}

export function resolveSkillInstallVariant(
  targetRoot: string,
  requested?: SkillInstallVariant,
): SkillInstallVariant {
  if (requested) return requested;
  return hasLocalAuthoringContent(targetRoot) ? "all" : "agent";
}

export function skillPackageRoot(): string {
  return cliPackageRoot();
}

export function skillSourceDir(
  variant: Exclude<SkillInstallVariant, "all"> = "agent",
): string {
  return cliResourcePath(SKILL_SOURCE_DIRS[variant]);
}

export function defaultInstallPath(
  targetRoot: string,
  variant: Exclude<SkillInstallVariant, "all"> = "agent",
): string {
  return join(targetRoot, ".cursor", "skills", SKILL_DIRS[variant]);
}

export function legacyInstallPath(targetRoot: string): string {
  return join(targetRoot, ".cursor", "skills", LEGACY_SKILL_DIR_NAME);
}

export function legacyMonolithInstallPath(targetRoot: string): string {
  return join(targetRoot, ".cursor", "skills", LEGACY_MONOLITH_SKILL_DIR_NAME);
}

export function readSkillVersion(
  variant: Exclude<SkillInstallVariant, "all"> = "agent",
): string {
  const source = skillSourceDir(variant);
  const versionPath = join(source, "VERSION");
  if (!existsSync(versionPath)) return "0.0.0";
  return readFileSync(versionPath, "utf-8").trim();
}

function installVariant(
  targetRoot: string,
  variant: Exclude<SkillInstallVariant, "all">,
): InstalledSkill {
  const source = skillSourceDir(variant);
  if (!existsSync(join(source, "SKILL.md")) || !existsSync(join(source, "VERSION"))) {
    throw new Error(`Skill source missing at ${source}`);
  }
  const dest = defaultInstallPath(targetRoot, variant);
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
  return {
    variant,
    path: dest,
    version: readSkillVersion(variant),
  };
}

export function installMurrmureSkill(
  targetRoot: string = process.cwd(),
  options?: { variant?: SkillInstallVariant },
): InstallMurrmureSkillResult {
  const variant = resolveSkillInstallVariant(targetRoot, options?.variant);

  for (const legacyPath of [legacyInstallPath(targetRoot), legacyMonolithInstallPath(targetRoot)]) {
    if (existsSync(legacyPath)) {
      rmSync(legacyPath, { recursive: true, force: true });
    }
  }

  const selected: Array<Exclude<SkillInstallVariant, "all">> =
    variant === "all" ? ["agent", "developer"] : [variant];
  const installed = selected.map((entry) => installVariant(targetRoot, entry));
  const first = installed[0] ?? installVariant(targetRoot, "agent");
  return {
    ok: true,
    variant,
    path: first.path,
    version: first.version,
    installed,
  };
}
