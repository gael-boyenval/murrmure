import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultInstallPath,
  hasLocalAuthoringContent,
  legacyInstallPath,
  legacyMonolithInstallPath,
  readSkillVersion,
} from "../skill/install.js";

type SpaceDoctorSeverity = "error" | "warning" | "info";

export interface SpaceDoctorSkillIssue {
  code: string;
  severity: SpaceDoctorSeverity;
  message: string;
  path?: string;
  fix?: string;
}

export interface SpaceDoctorSkillsContext {
  archetype: "worker" | "authoring";
  requires_developer: boolean;
  bundled_versions: {
    agent: string;
    developer: string;
  };
  installed_versions: {
    agent?: string;
    developer?: string;
  };
  legacy: {
    monolith_present: boolean;
    retired_flow_skill_present: boolean;
  };
}

function parseSemver(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  return [
    Number.isFinite(parts[0]) ? parts[0]! : 0,
    Number.isFinite(parts[1]) ? parts[1]! : 0,
    Number.isFinite(parts[2]) ? parts[2]! : 0,
  ];
}

function isOlderThan(a: string | undefined, b: string): boolean {
  if (!a) return true;
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);
  if (aMajor !== bMajor) return aMajor < bMajor;
  if (aMinor !== bMinor) return aMinor < bMinor;
  return aPatch < bPatch;
}

function readInstalledVersion(path: string): string | undefined {
  const versionPath = join(path, "VERSION");
  if (existsSync(versionPath)) {
    return readFileSync(versionPath, "utf-8").trim();
  }
  return undefined;
}

function issue(input: SpaceDoctorSkillIssue): SpaceDoctorSkillIssue {
  return input;
}

export function scanSpaceDoctorSkills(
  projectPath: string,
): { issues: SpaceDoctorSkillIssue[]; context: SpaceDoctorSkillsContext } {
  const requiresDeveloper = hasLocalAuthoringContent(projectPath);
  const agentPath = defaultInstallPath(projectPath, "agent");
  const developerPath = defaultInstallPath(projectPath, "developer");
  const legacyMonolithPath = legacyMonolithInstallPath(projectPath);
  const retiredFlowSkillPath = legacyInstallPath(projectPath);

  const bundledAgent = readSkillVersion("agent");
  const bundledDeveloper = readSkillVersion("developer");
  const installedAgent = readInstalledVersion(agentPath);
  const installedDeveloper = readInstalledVersion(developerPath);

  const issues: SpaceDoctorSkillIssue[] = [];

  if (!installedAgent) {
    issues.push(issue({
      code: "SKILL_AGENT_MISSING",
      severity: "warning",
      message: "murrmure-agent skill is missing",
      path: agentPath,
      fix: "mrmr skill install --variant agent",
    }));
  } else if (isOlderThan(installedAgent, bundledAgent)) {
    issues.push(issue({
      code: "SKILL_AGENT_OUTDATED",
      severity: "warning",
      message: `murrmure-agent is outdated (${installedAgent} < ${bundledAgent})`,
      path: agentPath,
      fix: "mrmr skill install --variant agent",
    }));
  }

  if (requiresDeveloper) {
    if (!installedDeveloper) {
      issues.push(issue({
        code: "SKILL_DEVELOPER_MISSING",
        severity: "warning",
        message: "murrmure-developer skill is missing for this authoring space",
        path: developerPath,
        fix: "mrmr skill install --variant developer",
      }));
    } else if (isOlderThan(installedDeveloper, bundledDeveloper)) {
      issues.push(issue({
        code: "SKILL_DEVELOPER_OUTDATED",
        severity: "warning",
        message: `murrmure-developer is outdated (${installedDeveloper} < ${bundledDeveloper})`,
        path: developerPath,
        fix: "mrmr skill install --variant developer",
      }));
    }
  }

  if (existsSync(legacyMonolithPath)) {
    issues.push(issue({
      code: "SKILL_LEGACY_MONOLITH",
      severity: "info",
      message: "Legacy monolith skill (.cursor/skills/murrmure) still exists",
      path: legacyMonolithPath,
      fix: "mrmr skill install --variant all",
    }));
  }

  if (existsSync(retiredFlowSkillPath)) {
    issues.push(issue({
      code: "SKILL_RETIRED_FLOW",
      severity: "info",
      message: "Retired murrmure-flow skill directory still exists",
      path: retiredFlowSkillPath,
      fix: "mrmr skill install --variant all",
    }));
  }

  return {
    issues,
    context: {
      archetype: requiresDeveloper ? "authoring" : "worker",
      requires_developer: requiresDeveloper,
      bundled_versions: {
        agent: bundledAgent,
        developer: bundledDeveloper,
      },
      installed_versions: {
        agent: installedAgent,
        developer: installedDeveloper,
      },
      legacy: {
        monolith_present: existsSync(legacyMonolithPath),
        retired_flow_skill_present: existsSync(retiredFlowSkillPath),
      },
    },
  };
}
