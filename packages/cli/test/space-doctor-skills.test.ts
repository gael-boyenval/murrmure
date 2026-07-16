import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSpaceDoctor } from "../src/lib/space-doctor.js";
import {
  defaultInstallPath,
  legacyInstallPath,
  legacyMonolithInstallPath,
  readSkillVersion,
} from "../src/skill/install.js";

const created: string[] = [];

function makeProject(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  mkdirSync(join(dir, ".mrmr", "space"), { recursive: true });
  writeFileSync(
    join(dir, ".mrmr", "space", "space.yaml"),
    "apiVersion: murrmure.space/v1\nslug: demo\n",
    "utf-8",
  );
  return dir;
}

function installVersion(target: string, variant: "agent" | "developer", version: string): void {
  const path = defaultInstallPath(target, variant);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "VERSION"), `${version}\n`, "utf-8");
}

function writeAuthoringFlow(project: string): void {
  mkdirSync(join(project, ".mrmr", "flows", "demo"), { recursive: true });
  writeFileSync(
    join(project, ".mrmr", "flows", "demo", "flow.manifest.yaml"),
    [
      "apiVersion: murrmure.flow/v1",
      "name: demo-flow",
      "start:",
      "  manual: true",
      "steps:",
      "  - id: write_spec",
      "    role: agent",
      "    branches:",
      "      completed:",
      "        schema: { type: object }",
      "        next: null",
      "",
    ].join("\n"),
    "utf-8",
  );
}

afterEach(() => {
  for (const dir of created.splice(0, created.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("space doctor skills policy", () => {
  test("worker space passes skill checks with agent skill only", async () => {
    const project = makeProject("cli-doctor-worker-skills-");
    installVersion(project, "agent", readSkillVersion("agent"));

    const result = await runSpaceDoctor({ projectPath: project, skipTests: true });
    const skillCodes = new Set(result.issues.map((issue) => issue.code));

    expect(skillCodes.has("SKILL_AGENT_MISSING")).toBe(false);
    expect(skillCodes.has("SKILL_DEVELOPER_MISSING")).toBe(false);
    expect(result.skills?.archetype).toBe("worker");
  });

  test("authoring space warns when developer skill is missing", async () => {
    const project = makeProject("cli-doctor-authoring-skills-");
    writeAuthoringFlow(project);
    installVersion(project, "agent", readSkillVersion("agent"));

    const result = await runSpaceDoctor({ projectPath: project, skipTests: true });
    const skillCodes = new Set(result.issues.map((issue) => issue.code));

    expect(skillCodes.has("SKILL_AGENT_MISSING")).toBe(false);
    expect(skillCodes.has("SKILL_DEVELOPER_MISSING")).toBe(true);
    expect(result.skills?.archetype).toBe("authoring");
  });

  test("reports outdated split skills", async () => {
    const project = makeProject("cli-doctor-outdated-skills-");
    writeAuthoringFlow(project);
    installVersion(project, "agent", "0.0.1");
    installVersion(project, "developer", "0.0.1");

    const result = await runSpaceDoctor({ projectPath: project, skipTests: true });
    const skillCodes = new Set(result.issues.map((issue) => issue.code));

    expect(skillCodes.has("SKILL_AGENT_OUTDATED")).toBe(true);
    expect(skillCodes.has("SKILL_DEVELOPER_OUTDATED")).toBe(true);
  });

  test("reports legacy monolith and retired flow skill directories", async () => {
    const project = makeProject("cli-doctor-legacy-skills-");
    mkdirSync(legacyMonolithInstallPath(project), { recursive: true });
    mkdirSync(legacyInstallPath(project), { recursive: true });

    const result = await runSpaceDoctor({ projectPath: project, skipTests: true });
    const skillCodes = new Set(result.issues.map((issue) => issue.code));

    expect(skillCodes.has("SKILL_LEGACY_MONOLITH")).toBe(true);
    expect(skillCodes.has("SKILL_RETIRED_FLOW")).toBe(true);
  });
});
