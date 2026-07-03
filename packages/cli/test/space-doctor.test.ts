import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverMurrmureProject,
  formatSpaceDoctorHuman,
  runSpaceDoctor,
  scanLegacyWorkspace,
} from "../src/lib/space-doctor.js";

describe("runSpaceDoctor", () => {
  let projectDir: string;
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    delete process.env.MURRMURE_HUB_URL;
    delete process.env.MURRMURE_HUB_TOKEN;
    delete process.env.MURRMURE_TOKEN;
    delete process.env.MURRMURE_SPACE_ID;
    projectDir = mkdtempSync(join(tmpdir(), "cli-space-doctor-"));
    const root = join(projectDir, "murrmure");
    mkdirSync(join(root, "flows", "demo"), { recursive: true });
    writeFileSync(
      join(root, "actions.yaml"),
      "version: 1\nactions:\n  hello:\n    executor: shell\n",
    );
    writeFileSync(
      join(root, "flows", "demo", "flow.manifest.yaml"),
      "apiVersion: murrmure.flow/v1\nname: demo\nstart:\n  manual: true\nsteps:\n  - id: hello\n    invoke:\n      space: spc_demo\n      action: hello\n",
    );
    mkdirSync(join(projectDir, ".murrmure"), { recursive: true });
    writeFileSync(
      join(projectDir, ".murrmure", "link.json"),
      JSON.stringify({ space_id: "spc_demo", path: projectDir, host: "local" }),
    );
  });

  afterEach(() => {
    process.env = envSnapshot;
    vi.unstubAllGlobals();
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("passes for valid local tree without hub auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/index/status")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              counts: { actions: 1, executors: 0, hooks: 0, flows: 1 },
              digests: {
                actions: undefined,
                flows: [{ flow_id: "flw_flows_demo", digest: "placeholder" }],
              },
              bindings: [{ host: "local", path: projectDir }],
            }),
          };
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      skipTests: true,
    });
    expect(result.local?.counts.flows).toBe(1);
    expect(result.issues.some((issue) => issue.code === "LOCAL_VALIDATION_FAILED")).toBe(false);
  });

  test("reports INDEX_DRIFT when hub digests differ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          counts: { actions: 1, executors: 0, hooks: 0, flows: 1 },
          digests: {
            actions: "sha256:stale",
            flows: [{ flow_id: "flw_flows_demo", digest: "sha256:stale" }],
          },
          bindings: [{ host: "local", path: projectDir }],
        }),
      })),
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      auth: { hubUrl: "http://127.0.0.1:8787", token: "tok_test" },
      skipTests: true,
    });

    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.code === "INDEX_DRIFT")).toBe(true);
  });

  test("warns about legacy triggers.yaml alias", async () => {
    writeFileSync(
      join(projectDir, "murrmure", "triggers.yaml"),
      "version: 1\nhooks:\n  on_event:\n    on:\n      event:\n        type: mrmr.spec.published\n    do:\n      - invoke:\n          action: hello\n",
    );

    const result = await runSpaceDoctor({
      projectPath: projectDir,
      spaceId: "spc_demo",
      skipTests: true,
    });

    expect(result.issues.some((issue) => issue.code === "DEPRECATED_CONFIG")).toBe(true);
  });

  test("detects legacy studio layout without murrmure/", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-space-legacy-"));
    writeFileSync(
      join(legacyDir, "package.json"),
      JSON.stringify({
        devDependencies: { "@studio/capability-sdk": "file:../sdk" },
      }),
    );
    mkdirSync(join(legacyDir, "workflows", "demo"), { recursive: true });
    writeFileSync(join(legacyDir, "workflows", "demo", "capability.manifest.json"), "{}");

    const result = await runSpaceDoctor({ cwd: join(legacyDir, "workflows"), skipTests: true });
    expect(result.workspace.legacy_studio_detected).toBe(true);
    expect(result.issues.some((issue) => issue.code === "MURRMURE_DIR_MISSING")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "LEGACY_STUDIO_PACKAGE")).toBe(true);
    expect(result.suggestions.some((step) => step.includes("mrmr space init"))).toBe(true);

    rmSync(legacyDir, { recursive: true, force: true });
  });

  test("discovers murrmure project from subdirectory cwd", () => {
    const sub = join(projectDir, "packages", "app");
    mkdirSync(sub, { recursive: true });
    const discovered = discoverMurrmureProject(sub);
    expect(discovered.projectPath).toBe(projectDir);
    expect(discovered.murrmurePresent).toBe(true);
  });

  test("scanLegacyWorkspace flags capability manifests", () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-legacy-scan-"));
    mkdirSync(join(legacyDir, "flows", "x"), { recursive: true });
    writeFileSync(join(legacyDir, "flows", "x", "capability.manifest.json"), "{}");
    const issues = scanLegacyWorkspace(legacyDir);
    expect(issues.some((issue) => issue.code === "LEGACY_CAPABILITY_MANIFEST")).toBe(true);
    rmSync(legacyDir, { recursive: true, force: true });
  });

  test("formats legacy migration output without internal codes", async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), "cli-space-legacy-fmt-"));
    mkdirSync(join(legacyDir, "murrmure"), { recursive: true });
    writeFileSync(
      join(legacyDir, "package.json"),
      JSON.stringify({ devDependencies: { "@studio/capability-sdk": "1.0.0" } }),
    );
    mkdirSync(join(legacyDir, "workflows", "demo"), { recursive: true });
    writeFileSync(join(legacyDir, "workflows", "demo", "capability.manifest.json"), "{}");

    const result = await runSpaceDoctor({ cwd: legacyDir, skipTests: true });
    const text = formatSpaceDoctorHuman(result);
    expect(text).not.toContain("LEGACY_STUDIO_PACKAGE");
    expect(text).toContain("Legacy Studio v1 detected");
    expect(text).toContain("Try this");
    expect(text).toContain("mrmr space onboard");

    rmSync(legacyDir, { recursive: true, force: true });
  });
});
