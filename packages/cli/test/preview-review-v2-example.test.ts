import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { parseHandlersFile } from "@murrmure/hub-core";
import {
  compileStepContractCatalog,
  lintHandlerCatalogCoverage,
  lintSpaceApplyBundle,
  parseFlowManifest,
  strictLintFailures,
} from "@murrmure/hub-core";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { buildScaffoldedView } from "./helpers/link-view-scaffold-deps.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const EXAMPLE_ROOT = join(REPO_ROOT, "test-utils/spaces/preview-review-v2");
const MURRMURE_ROOT = join(EXAMPLE_ROOT, ".mrmr");
const NESTED_STEP_IDS = ["intake", "write_spec", "build", "archive", "commit"];
const PREVIEW_REVIEW_FLOW_ID = "flw_flows_preview_review";

describe("preview-review-v2 reference example", () => {
  test(".mrmr tree matches v2.2 nested step contract manifest", () => {
    const manifestPath = join(MURRMURE_ROOT, "flows/preview-review/flow.manifest.yaml");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as {
      triggers: unknown;
      steps: Array<Record<string, unknown>>;
    };

    expect(manifest.triggers).toEqual({ manual: true });
    expect(manifest.steps.map((s) => s.id)).toEqual(NESTED_STEP_IDS);
    expect(manifest.steps.some((s) => s.id === "review")).toBe(false);
    expect(manifest.steps.some((s) => "executor" in s)).toBe(false);

    const intake = manifest.steps[0] as {
      branches?: Record<string, unknown>;
    };
    expect(intake.branches?.continue).toBeDefined();

    const build = manifest.steps[2] as {
      steps?: Array<{ id: string; branches?: Record<string, unknown> }>;
    };
    expect(build.steps?.map((s) => s.id)).toEqual(["build-loop", "review"]);

    const buildLoop = build.steps?.[0];
    expect(buildLoop?.branches?.completed).toMatchObject({ resume: "build" });

    const nestedReview = build.steps?.[1];
    expect(nestedReview?.branches?.validated).toMatchObject({ resume: "build" });
    expect(nestedReview?.branches?.changes_required).toMatchObject({
      resume: "build",
    });
  });

  test("views use createViewMount from @murrmure/view-sdk/app", () => {
    for (const viewId of ["preview-review", "preview-review-intake"]) {
      const main = readFileSync(join(MURRMURE_ROOT, "views", viewId, "src/main.tsx"), "utf-8");
      expect(main).toContain('from "@murrmure/view-sdk/app"');
      expect(main).toContain("createViewMount");
    }
  });

  test("feature-build skill uses parent-owned child activation loop", () => {
    const skill = readFileSync(join(EXAMPLE_ROOT, "skills/feature-build/SKILL.md"), "utf-8");
    expect(skill).toContain("murrmure_resolve_step");
    expect(skill).toContain("murrmure_open_child_step");
    expect(skill).toContain("active-step-contract.json");
    expect(skill).not.toContain("murrmure_complete_action");
  });

  test("feature handlers use contract_keys and headless agent flags", () => {
    const handlersRaw = parseYaml(
      readFileSync(join(MURRMURE_ROOT, "space", "handlers.yaml"), "utf-8"),
    );
    const parsed = parseHandlersFile(handlersRaw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ids = parsed.value.handlers.map((h) => h.id);
    expect(ids).toEqual([
      "intake_view",
      "feature_write_spec",
      "feature_build",
      "feature_build_loop",
      "review_view",
      "feature_archive",
      "feature_commit",
    ]);
    const viewResolver = parsed.value.handlers.find((h) => h.type === "view_resolver");
    expect(viewResolver?.view).toBe("preview-review-intake");
    expect(viewResolver?.on).toBe("step.opened::preview-review.intake");
    expect(
      parsed.value.handlers
        .filter((h) => h.type !== "view_resolver")
        .every((h) => (h.contract_keys ?? []).length > 0),
    ).toBe(true);
    expect(
      parsed.value.handlers.every(
        (h) => typeof h.on === "string" && h.on.startsWith("step.opened::"),
      ),
    ).toBe(true);

    const handlersText = readFileSync(join(MURRMURE_ROOT, "space", "handlers.yaml"), "utf-8");
    expect(handlersText).toContain("--approve-mcps");
    expect(handlersText).toContain("--output-format stream-json");
    expect(handlersText).toContain("murrmure_resolve_step");
    expect(handlersText).not.toContain("murrmure_complete_action");
    expect(handlersText).not.toContain("murrmure_wait_for_gate");
  });

  test("write_spec handler catalog coverage for preview-review manifest", () => {
    const manifestPath = join(MURRMURE_ROOT, "flows/preview-review/flow.manifest.yaml");
    const parsed = parseFlowManifest(parseYaml(readFileSync(manifestPath, "utf-8")));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const manifest = parsed.value;
    const { catalog } = compileStepContractCatalog(manifest, PREVIEW_REVIEW_FLOW_ID);
    expect(catalog).not.toBeNull();

    const contractKey = (stepId: string) => `${manifest.name}.${stepId}`;

    const writeSpec = catalog!.entries.find((entry) => entry.step_id === "write_spec");
    expect(writeSpec).toBeDefined();
    expect(contractKey("write_spec")).toBe("preview-review.write_spec");

    const buildReview = catalog!.entries.find((entry) => entry.step_id === "build.review");
    expect(buildReview).toBeDefined();
    expect(contractKey("build.review")).toBe("preview-review.build.review");

    const writeSpecOnlyWarnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        run_policies: [],
        handlers: [
          {
            id: "write-spec",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened::preview-review.write_spec",
            type: "shell_spawn",
            complete: "explicit",
          },
        ],
      },
      flows: [{ flow_id: PREVIEW_REVIEW_FLOW_ID, manifest }],
    });
    expect(writeSpecOnlyWarnings.some((warning) => warning.code === "HANDLER_ORPHAN_KEY")).toBe(false);

    const scopedWarnings = lintHandlerCatalogCoverage({
      handlers: {
        version: 1,
        run_policies: [],
        handlers: [
          {
            id: "build-handoff",
            contract_keys: ["preview-review.write_spec", "preview-review.build.review"],
            on: "step.opened::preview-review.write_spec",
            type: "shell_spawn",
            complete: "explicit",
          },
        ],
      },
      flows: [{ flow_id: PREVIEW_REVIEW_FLOW_ID, manifest }],
    });
    expect(
      scopedWarnings.some(
        (warning) => warning.code === "HANDLER_ORPHAN_KEY" && warning.contract_key === "preview-review.build.review",
      ),
    ).toBe(false);
    expect(scopedWarnings.some((warning) => warning.code === "HANDLER_ORPHAN_KEY")).toBe(false);
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
    expect(scanPaths.some((p) => p.includes("handlers.yaml"))).toBe(true);
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
