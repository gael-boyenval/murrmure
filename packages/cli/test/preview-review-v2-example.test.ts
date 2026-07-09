import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { buildScaffoldedView } from "./helpers/link-view-scaffold-deps.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const EXAMPLE_ROOT = join(REPO_ROOT, "examples/flows/preview-review-v2");
const MURRMURE_ROOT = join(EXAMPLE_ROOT, "murrmure");

const NESTED_STEP_IDS = ["intake", "write_spec", "build", "archive", "commit"];

describe("preview-review-v2 reference example", () => {
  test("murrmure tree matches v2.2 nested step contract manifest", () => {
    const manifestPath = join(MURRMURE_ROOT, "flows/preview-review/flow.manifest.yaml");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as {
      triggers: unknown;
      steps: Array<Record<string, unknown>>;
    };

    expect(manifest.triggers).toEqual({ manual: true });
    expect(manifest.steps.map((s) => s.id)).toEqual(NESTED_STEP_IDS);
    expect(manifest.steps.some((s) => s.id === "review")).toBe(false);

    const intake = manifest.steps[0] as {
      presentation?: { view: string };
      branches?: Record<string, unknown>;
    };
    expect(intake.presentation?.view).toBe("preview-review-intake");
    expect(intake.branches?.continue).toBeDefined();

    const build = manifest.steps[2] as {
      orchestration?: string;
      executor?: { action: string };
      steps?: Array<{ id: string; branches?: Record<string, unknown> }>;
    };
    expect(build.orchestration).toBe("engine-routed");
    expect(build.executor?.action).toBe("feature_build");
    expect(build.steps?.map((s) => s.id)).toEqual(["build-loop", "review"]);

    const buildLoop = build.steps?.[0];
    expect(buildLoop?.branches?.completed).toMatchObject({ goto: "review" });

    const nestedReview = build.steps?.[1];
    expect(nestedReview?.branches?.validated).toMatchObject({ complete: "parent" });
    expect(nestedReview?.branches?.changes_required).toMatchObject({
      continue: "parent",
      goto: "build-loop",
    });
  });

  test("views use createViewMount from @murrmure/view-sdk/app", () => {
    for (const viewId of ["preview-review", "preview-review-intake"]) {
      const main = readFileSync(join(MURRMURE_ROOT, "views", viewId, "src/main.tsx"), "utf-8");
      expect(main).toContain('from "@murrmure/view-sdk/app"');
      expect(main).toContain("createViewMount");
    }
  });

  test("feature-build skill uses resolve_step and contract file loop", () => {
    const skill = readFileSync(join(EXAMPLE_ROOT, "skills/feature-build/SKILL.md"), "utf-8");
    expect(skill).toContain("murrmure_resolve_step");
    expect(skill).toContain("active-step-contract.json");
    expect(skill).not.toContain("murrmure_complete_action");
  });

  test("feature actions use headless agent flags and hub resolve_step", () => {
    const actions = readFileSync(join(MURRMURE_ROOT, "actions.yaml"), "utf-8");
    expect(actions).toContain("--approve-mcps");
    expect(actions).toContain("--output-format stream-json");
    expect(actions).toContain("murrmure_resolve_step");
    expect(actions).not.toContain("murrmure.agentStepContract");
    expect(actions).not.toContain("murrmure_complete_action");
    expect(actions).not.toContain("murrmure_wait_for_gate");
  });

  test("build-loop branch requires preview_url", () => {
    const manifest = parseYaml(
      readFileSync(join(MURRMURE_ROOT, "flows/preview-review/flow.manifest.yaml"), "utf-8"),
    ) as { steps: Array<{ id: string; steps?: Array<{ id: string; branches?: Record<string, unknown> }> }> };
    const build = manifest.steps.find((s) => s.id === "build");
    const buildLoop = build?.steps?.find((s) => s.id === "build-loop");
    const completed = buildLoop?.branches?.completed as { schema?: { required?: string[] } } | undefined;
    expect(completed?.schema?.required).toContain("preview_url");
  });

  test("R6 — no FDK commands in workflow tree", () => {
    const fdkPattern =
      /flow push|flow-dev-kit|mrmr flow init(?!.*space flow init)|create_review_session|wait_for_review/i;
    const skipDirs = new Set(["node_modules", "dist"]);
    const textFile = /\.(yaml|yml|mjs|tsx?|json|html|css)$/i;

    const collectTextFiles = (dir: string): string[] => {
      const paths: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (skipDirs.has(entry)) continue;
          paths.push(...collectTextFiles(full));
        } else if (textFile.test(entry)) {
          paths.push(full);
        }
      }
      return paths;
    };

    const scanPaths = collectTextFiles(MURRMURE_ROOT);
    expect(scanPaths.some((p) => p.includes("executors.yaml"))).toBe(true);
    expect(scanPaths.some((p) => p.includes("hooks.yaml"))).toBe(true);
    expect(scanPaths.some((p) => p.endsWith("App.tsx"))).toBe(true);
    for (const path of scanPaths) {
      expect(readFileSync(path, "utf-8")).not.toMatch(fdkPattern);
    }
  });

  test("v2.2 manifest passes strict apply lint", () => {
    for (const viewId of ["preview-review", "preview-review-intake"]) {
      const viewDir = join(MURRMURE_ROOT, "views", viewId);
      const distIndex = join(viewDir, "dist", "index.html");
      if (!existsSync(distIndex)) {
        rmSync(join(viewDir, "node_modules"), { recursive: true, force: true });
        buildScaffoldedView(viewDir);
      }
      expect(existsSync(distIndex)).toBe(true);
    }

    const bundle = readSpaceApplyBundle(EXAMPLE_ROOT);
    const warnings = lintSpaceApplyBundle(bundle);
    const strictFailures = strictLintFailures(warnings);
    expect(strictFailures).toEqual([]);
    expect(bundle.flows?.some((f) => f.flow_id === "flw_flows_preview_review")).toBe(true);
  }, 120_000);
});
