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
  "apps/docs/guide/tutorials/01-local-preview-review/01-scaffold-flow.md",
  "apps/docs/guide/tutorials/01-local-preview-review/02-install-and-connect.md",
  "apps/docs/guide/tutorials/01-local-preview-review/03-run-feedback-loop.md",
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

  test("10-T1 — preview-review-v2 example passes strict apply (Tutorial 1 tree)", () => {
    assertStrictApply(join(REPO_ROOT, "examples/flows/preview-review-v2"), [
      "preview-review",
      "preview-review-intake",
    ]);
  }, 120_000);

  test("10-T1b — preview-review manifest documents agent-owned orchestration variant", () => {
    const manifestPath = join(
      REPO_ROOT,
      "examples/flows/preview-review-v2/murrmure/flows/preview-review/flow.manifest.yaml",
    );
    const readme = readFileSync(
      join(REPO_ROOT, "examples/flows/preview-review-v2/README.md"),
      "utf-8",
    );
    expect(readme).toMatch(/wait_for_gate|murrmure_wait_for_gate/i);
    const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as {
      steps: Array<{ checkpoint?: { on_resolve?: unknown } }>;
    };
    expect(manifest.steps.some((s) => s.checkpoint?.on_resolve)).toBe(true);
  });

  test("10-T2 — team-brief-v2 example passes strict apply", () => {
    assertStrictApply(join(REPO_ROOT, "examples/flows/team-brief-v2"));
  });

  test("10-T3 — daily-brief-v2 example passes strict apply", () => {
    assertStrictApply(join(REPO_ROOT, "examples/flows/daily-brief-v2"), ["daily-brief"]);
  }, 120_000);

  test("10-U5 — demo-space passes strict apply", () => {
    assertStrictApply(join(REPO_ROOT, "demo-space"));
  });

  test("flows-tutorial example hello-authoring passes strict apply", () => {
    assertStrictApply(join(REPO_ROOT, "examples/flows/hello-authoring"));
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
