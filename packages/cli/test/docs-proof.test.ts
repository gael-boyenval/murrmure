import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { buildScaffoldedView } from "./helpers/link-view-scaffold-deps.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const FDK_PATTERN =
  /flow push|flow-dev-kit|@murrmure\/flow-kit|mrmr flow init(?![\s\S]{0,40}space flow init)|create_review_session|wait_for_review|installExampleCapability|flow-evolution|Flow evolution pipeline|Flow Dev Kit|\bFDK\b|evolution HTTP|evolution-pipeline|capability-authoring/i;

const TUTORIAL_PAGES = [
  "apps/docs/guide/tutorials/index.md",
  "apps/docs/guide/tutorials/01-local-preview-review/index.md",
  "apps/docs/guide/tutorials/01-local-preview-review/01-create-the-repo.md",
  "apps/docs/guide/tutorials/01-local-preview-review/02-setup-wizard.md",
  "apps/docs/guide/tutorials/01-local-preview-review/03-agent-md-and-skills.md",
  "apps/docs/guide/tutorials/01-local-preview-review/04-prompt-triggers.md",
  "apps/docs/guide/tutorials/01-local-preview-review/05-flow-manifest.md",
  "apps/docs/guide/tutorials/01-local-preview-review/06-build-views.md",
  "apps/docs/guide/tutorials/01-local-preview-review/07-index-and-apply.md",
  "apps/docs/guide/tutorials/01-local-preview-review/08-run-the-loop.md",
  "apps/docs/guide/tutorials/01-local-preview-review/09-troubleshooting.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/index.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/01-build-orchestrator-flow.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/02-admin-setup.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/03-connect-agents.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/04-run-workflow.md",
  "apps/docs/guide/tutorials/02-multi-agent-brief/05-troubleshooting.md",
  "apps/docs/guide/tutorials/03-daily-brief-trigger/index.md",
  "apps/docs/guide/tutorials/03-daily-brief-trigger/01-scaffold-daily-brief.md",
  "apps/docs/guide/tutorials/03-daily-brief-trigger/02-push-and-trigger.md",
  "apps/docs/guide/tutorials/03-daily-brief-trigger/03-connect-agent.md",
  "apps/docs/guide/tutorials/03-daily-brief-trigger/04-run-and-review.md",
  "apps/docs/guide/flows-tutorial.md",
];

function ensureViewsBuilt(murrmureRoot: string, viewIds: string[]) {
  for (const viewId of viewIds) {
    const viewDir = join(murrmureRoot, "views", viewId);
    const distIndex = join(viewDir, "dist", "index.html");
    if (!existsSync(distIndex)) {
      buildScaffoldedView(viewDir);
    }
    expect(existsSync(distIndex)).toBe(true);
  }
}

function assertStrictApply(spaceRoot: string, viewIds: string[] = []) {
  const murrmureRoot = join(spaceRoot, "murrmure");
  if (viewIds.length > 0) ensureViewsBuilt(murrmureRoot, viewIds);
  const bundle = readSpaceApplyBundle(spaceRoot);
  const warnings = lintSpaceApplyBundle(bundle);
  expect(strictLintFailures(warnings)).toEqual([]);
}

describe("phase 10 docs proof (10-T*)", () => {
  test("10-T4 — tutorial pages exist and contain no FDK install steps", () => {
    for (const rel of TUTORIAL_PAGES) {
      const path = join(REPO_ROOT, rel);
      expect(existsSync(path), `missing tutorial page: ${rel}`).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content, rel).not.toMatch(FDK_PATTERN);
    }
  });

  test("10-T1 — preview-review-v2 example passes apply lint (v2.2 step contracts)", () => {
    assertStrictApply(join(REPO_ROOT, "examples/flows/preview-review-v2"), [
      "preview-review",
      "preview-review-intake",
    ]);
  });

  test("10-T1b — preview-review manifest uses nested build + resolve_step", () => {
    const manifestPath = join(
      REPO_ROOT,
      "examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml",
    );
    const readme = readFileSync(
      join(REPO_ROOT, "examples/flows/preview-review-v2/README.md"),
      "utf-8",
    );
    expect(readme).toMatch(/resolve_step|build\.build-loop/i);
    expect(readme).not.toMatch(/murrmure_complete_action|murrmure_wait_for_gate/i);
    const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as {
      steps: Array<{ id: string; steps?: Array<{ id: string }> }>;
    };
    const build = manifest.steps.find((s) => s.id === "build");
    expect(build?.steps?.some((c) => c.id === "review")).toBe(true);
    expect(manifest.steps.some((s) => s.id === "review")).toBe(false);
  });

  test("10-T2 — team-brief-v2 example fails parse on legacy invoke (strict)", () => {
    expect(() => readSpaceApplyBundle(join(REPO_ROOT, "examples/flows/team-brief-v2"))).toThrow(
      /LEGACY_STEP_KIND/,
    );
  });

  test("10-T3 — daily-brief-v2 example fails parse on legacy checkpoint (strict)", () => {
    expect(() => readSpaceApplyBundle(join(REPO_ROOT, "examples/flows/daily-brief-v2"))).toThrow(
      /LEGACY_STEP_KIND/,
    );
  });

  test("10-U5 — demo-space fails parse on legacy invoke (strict)", () => {
    expect(() => readSpaceApplyBundle(join(REPO_ROOT, "demo-space"))).toThrow(/LEGACY_STEP_KIND/);
  });

  test("flows-tutorial example hello-authoring fails parse on legacy invoke (strict)", () => {
    expect(() => readSpaceApplyBundle(join(REPO_ROOT, "examples/flows/hello-authoring"))).toThrow(
      /LEGACY_STEP_KIND/,
    );
  });

  test("VS-1 — step-contract bridge doc exists", () => {
    const bridge = join(REPO_ROOT, "studio-specs/current/bridges/step-contract.md");
    expect(existsSync(bridge)).toBe(true);
    const content = readFileSync(bridge, "utf-8");
    expect(content).toMatch(/branches/);
    expect(content).toMatch(/StepContractCatalog/);
  });

  test("VS-1 — v2 step contract manifest passes strict apply lint", () => {
    const manifest = {
      apiVersion: "murrmure.flow/v1",
      name: "strict-v2",
      start: { manual: true },
      steps: [
        {
          id: "intake",
          presentation: { view: "preview-review-intake" },
          branches: {
            continue: { schema: { type: "object" }, next: "work" },
            cancel: { schema: { type: "object" }, next: null, fail_run: true },
          },
        },
        {
          id: "work",
          executor: { action: "feature_write_spec" },
          branches: {
            completed: { schema: { type: "object" }, next: null },
          },
        },
      ],
    };
    const bundle = {
      actions: {
        digest: "sha256:actions",
        file: {
          version: 1,
          actions: {
            feature_write_spec: { executor: "shell" },
          },
        },
      },
      executors: {
        digest: "sha256:exec",
        file: {
          version: 1,
          executors: {
            shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
          },
        },
      },
      flows: [
        {
          flow_id: "flw_strict_v2",
          rel_path: "flows/strict-v2/flow.manifest.yaml",
          digest: "sha256:strictv2",
          manifest,
          raw: manifest,
        },
      ],
      views: [],
    };
    const warnings = lintSpaceApplyBundle(bundle);
    expect(strictLintFailures(warnings)).toEqual([]);
  });

  test("VS-8 — tutorial docs exclude removed MCP tools", () => {
    for (const rel of TUTORIAL_PAGES) {
      const content = readFileSync(join(REPO_ROOT, rel), "utf-8");
      expect(content, rel).not.toMatch(/murrmure_complete_action|murrmure_wait_for_gate|murrmure_resolve_gate/);
    }
    const mcpDoc = readFileSync(join(REPO_ROOT, "apps/docs/reference/mcp-tools.md"), "utf-8");
    expect(mcpDoc).not.toMatch(/murrmure_complete_action|murrmure_wait_for_gate|murrmure_resolve_gate/);
  });
});

describe("phase 10 known-gaps sync (10-U4)", () => {
  test("human and skill known-gaps What works sections match", () => {
    const human = readFileSync(join(REPO_ROOT, "apps/docs/guide/known-gaps.md"), "utf-8");
    const skill = readFileSync(
      join(REPO_ROOT, "packages/cli/skill/reference/known-gaps.md"),
      "utf-8",
    );
    const humanSection = human.match(/## What works today[\s\S]*/)?.[0]?.trim() ?? "";
    const skillSection =
      skill
        .match(/## What works today[\s\S]*/)?.[0]
        ?.trim()
        .replace(
          /See \[flow-authoring\.md\][^\n]+/,
          "See [Creating flows](./creating-flows) and [Quick start](./quick-start).",
        ) ?? "";
    expect(humanSection).toBe(skillSection);
  });
});

describe("phase 10 apps/docs FDK grep (10-U6)", () => {
  test("zero FDK terms in apps/docs text sources", async () => {
    const { scanFdkHits } = await import("../../../scripts/lib/fdk-docs-scan.mjs");
    const docsRoot = join(REPO_ROOT, "apps/docs");
    expect(scanFdkHits(docsRoot, REPO_ROOT)).toEqual([]);
  });
});
