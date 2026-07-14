import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSpaceDoctor } from "../src/lib/space-doctor.js";

function createProject(prefix: string): string {
  const projectDir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(projectDir, ".mrmr", "space"), { recursive: true });
  writeFileSync(
    join(projectDir, ".mrmr", "space", "space.yaml"),
    "apiVersion: murrmure.space/v1\nslug: demo\nname: Demo\n",
  );
  return projectDir;
}

function writeFlowWithAgentStep(projectDir: string): void {
  mkdirSync(join(projectDir, ".mrmr", "flows", "demo"), { recursive: true });
  writeFileSync(
    join(projectDir, ".mrmr", "flows", "demo", "flow.manifest.yaml"),
    [
      "apiVersion: murrmure.flow/v1",
      "name: demo-flow",
      "triggers:",
      "  manual: true",
      "steps:",
      "  - id: write_spec",
      "    description: Write spec.",
      "    branches:",
      "      completed:",
      "        schema: { type: object }",
      "        route: { run: completed }",
      "      failed:",
      "        schema: { type: object }",
      "        route: { run: failed }",
      "",
    ].join("\n"),
  );
}

const createdProjects: string[] = [];
const envSnapshot = { ...process.env };

function track(projectDir: string): string {
  createdProjects.push(projectDir);
  return projectDir;
}

afterEach(() => {
  process.env = { ...envSnapshot };
  for (const dir of createdProjects.splice(0, createdProjects.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  process.env = { ...envSnapshot };
  delete process.env.MURRMURE_HUB_URL;
  delete process.env.MURRMURE_HUB_TOKEN;
  delete process.env.MURRMURE_TOKEN;
  delete process.env.MURRMURE_SPACE_ID;
});

describe("space-doctor-handlers", () => {
  test("unbound steps are valid — no HANDLER_MISSING for uncovered steps", async () => {
    const projectDir = track(createProject("cli-space-doctor-handlers-missing-"));
    writeFlowWithAgentStep(projectDir);

    const result = await runSpaceDoctor({ projectPath: projectDir, skipTests: true });
    expect(result.issues.some((issue) => issue.code === "HANDLER_MISSING")).toBe(false);
  });

  test("reports orphan and conflict handler keys", async () => {
    const projectDir = track(createProject("cli-space-doctor-handlers-lint-"));
    writeFlowWithAgentStep(projectDir);
    writeFileSync(
      join(projectDir, ".mrmr", "space", "handlers.yaml"),
      [
        "version: 1",
        "handlers:",
        "  - id: writer-a",
        "    contract_keys: [demo-flow.write_spec]",
        "    on: step.opened",
        "    type: shell_spawn",
        "    command: echo A",
        "  - id: writer-b",
        "    contract_keys: [demo-flow.write_spec]",
        "    on: step.opened",
        "    type: shell_spawn",
        "    command: echo B",
        "  - id: orphan",
        "    contract_keys: [demo-flow.unknown]",
        "    on: step.opened",
        "    type: shell_spawn",
        "    command: echo orphan",
        "",
      ].join("\n"),
    );

    const result = await runSpaceDoctor({ projectPath: projectDir, skipTests: true });
    expect(result.issues.some((issue) => issue.code === "HANDLER_ORPHAN_KEY")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "HANDLER_KEY_CONFLICT")).toBe(true);
  });

  test("reports legacy actions and missing worker bindings", async () => {
    const projectDir = track(createProject("cli-space-doctor-handlers-worker-"));
    writeFileSync(
      join(projectDir, ".mrmr", "space", "handlers.yaml"),
      [
        "version: 1",
        "handlers:",
        "  - id: brief-wake",
        "    contract_keys: []",
        "    on:",
        "      event:",
        "        type: brief.requested",
        "    type: shell_spawn",
        "    command: echo wake",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(projectDir, ".mrmr", "space", "actions.yaml"),
      [
        "version: 1",
        "actions:",
        "  brief-wake:",
        "    executor: shell",
        "    command: echo legacy",
        "",
      ].join("\n"),
    );

    const result = await runSpaceDoctor({ projectPath: projectDir, skipTests: true });
    expect(result.issues.some((issue) => issue.code === "WORKER_NO_BINDINGS")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "HANDLER_LEGACY_ACTIONS")).toBe(true);
  });

  test("reports unresolved bindings and legacy layout", async () => {
    const projectDir = track(createProject("cli-space-doctor-handlers-bindings-"));
    writeFileSync(
      join(projectDir, ".mrmr", "space", "bindings.yaml"),
      [
        "version: 1",
        "flows: []",
        "views:",
        "  - ref: preview-review-intake",
        "    source: local:views/preview-review-intake",
        "",
      ].join("\n"),
    );
    mkdirSync(join(projectDir, ".murrmure"), { recursive: true });

    const result = await runSpaceDoctor({ projectPath: projectDir, skipTests: true });
    expect(result.issues.some((issue) => issue.code === "BINDINGS_UNRESOLVED")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "LEGACY_LAYOUT")).toBe(true);
  });
});
