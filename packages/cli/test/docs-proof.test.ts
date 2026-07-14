import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import { buildScaffoldedView } from "./helpers/link-view-scaffold-deps.js";
import { verifyTutorialV3Docs } from "./helpers/tutorial-v3-docs.js";

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
  "apps/docs/guide/tutorials/01-local-preview-review-v3/index.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/01-launch-and-create-space.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/02-build-minimal-flow.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/03-build-intake-view.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/04-run-and-understand.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/05-extend-flow-and-handlers.md",
  "apps/docs/guide/tutorials/01-local-preview-review-v3/06-cleanup-and-commit.md",
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
];

const LEGACY_RUNTIME_PATTERN =
  /murrmure_complete_action|murrmure_wait_for_gate|murrmure_resolve_gate|wait_for_gate|\.mrmr\.temp\/runs|\.murrmure\/link\.json|briefing\.md/i;

/** Canonical legacy space paths — allowed only when line mentions "legacy". */
const LEGACY_MURRMURE_LAYOUT =
  /murrmure\/(flows|views|actions\.yaml|hooks\.yaml|executors\.yaml|space\.yaml)/;

const EXECUTOR_ACTION_PATTERN = /executor:\s*[\r\n]+\s*action:/;

function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "archive" || entry === "archives") continue;
      files.push(...collectMarkdownFiles(path));
      continue;
    }
    if (entry.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function collectFiles(root: string, predicate: (name: string) => boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "archive" || entry === "archives" || entry === "node_modules" || entry === "dist") continue;
      files.push(...collectFiles(path, predicate));
      continue;
    }
    if (predicate(entry)) {
      files.push(path);
    }
  }
  return files;
}

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
  const murrmureRoot = join(spaceRoot, ".mrmr");
  if (viewIds.length > 0) ensureViewsBuilt(murrmureRoot, viewIds);
  const bundle = readSpaceApplyBundle(spaceRoot);
  const warnings = lintSpaceApplyBundle(bundle);
  expect(strictLintFailures(warnings)).toEqual([]);
}

function expectLegacyParseFailure(spacePath: string): void {
  expect(() => readSpaceApplyBundle(spacePath)).toThrow(
    /LEGACY_STEP_KIND|No \.mrmr\/ directory/,
  );
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

  test("TUTORIAL-V3-00 — stable fences match progressive fixtures", () => {
    expect(verifyTutorialV3Docs(REPO_ROOT)).toEqual([]);
  });

  test("10-T1 — preview-review-v2 example passes apply lint (v2.2 step contracts)", () => {
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/preview-review-v2"), [
      "preview-review",
      "preview-review-intake",
    ]);
  });

  test("10-T1b — preview-review manifest uses nested build + resolve_step", () => {
    const manifestPath = join(
      REPO_ROOT,
      "test-utils/spaces/preview-review-v2/.mrmr/flows/preview-review/flow.manifest.yaml",
    );
    const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as {
      steps: Array<{ id: string; steps?: Array<{ id: string }> }>;
    };
    const build = manifest.steps.find((s) => s.id === "build");
    expect(build?.steps?.some((c) => c.id === "review")).toBe(true);
    expect(manifest.steps.some((s) => s.id === "review")).toBe(false);
  });

  test("10-T2 — team-brief-v2 example passes apply lint (handlers + step contracts)", () => {
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/team-brief-v2"));
  });

  test("10-T3 — daily-brief-v2 example passes apply lint (handlers + step contracts)", () => {
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/daily-brief-v2"), ["daily-brief"]);
  });

  test("10-U5b — root .mrmr/space passes apply lint (feedback event handlers)", () => {
    assertStrictApply(REPO_ROOT);
  });

  test("flows-tutorial example hello-authoring passes apply lint (handlers + step contracts)", () => {
    assertStrictApply(join(REPO_ROOT, "test-utils/spaces/hello-authoring"));
  });

  test("10-U5 — minimal-mrmr fixture passes apply lint (handlers-only space)", () => {
    assertStrictApply(
      join(REPO_ROOT, "studio-specs/current/fixtures/spaces/minimal-mrmr"),
    );
  });

  test("VS-1 — step-contract bridge doc exists", () => {
    const bridge = join(REPO_ROOT, "studio-specs/current/bridges/step-contract.md");
    expect(existsSync(bridge)).toBe(true);
    const content = readFileSync(bridge, "utf-8");
    expect(content).toMatch(/branches/);
    expect(content).toMatch(/StepContractCatalog/);
  });

  test("VS-1 — v2 step contract manifest passes strict apply lint (handlers model)", () => {
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
          role: "agent",
          branches: {
            completed: { schema: { type: "object" }, next: null },
          },
        },
      ],
    };
    const bundle = {
      handlers: {
        digest: "sha256:handlers",
        file: {
          version: 1,
          handlers: [
            {
              id: "strict-v2-work",
              contract_keys: ["strict-v2.work"],
              on: "step.opened",
              type: "shell_spawn",
              complete: "explicit",
              command: "echo done",
              cwd: "{{space_root}}",
            },
          ],
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

  test("VS-6 — docs exclude legacy runtime path/tool patterns", () => {
    const docsRoot = join(REPO_ROOT, "apps/docs");
    const files = collectMarkdownFiles(docsRoot);
    for (const file of files) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const content = readFileSync(file, "utf-8");
      expect(content, rel).not.toMatch(LEGACY_RUNTIME_PATTERN);
    }
  });

  test("VS-6 — test-utils flow manifests ban executor.action", () => {
    const examplesRoot = join(REPO_ROOT, "test-utils/spaces");
    const flowManifests = collectFiles(
      examplesRoot,
      (entry) => entry.endsWith("flow.manifest.yaml") || entry.endsWith("flow.manifest.yml"),
    );
    for (const file of flowManifests) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const content = readFileSync(file, "utf-8");
      expect(content, rel).not.toMatch(/executor:\s*[\r\n]+\s*action:/);
      expect(content, rel).not.toContain("executor.action");
    }
  });

  test("DOC-LAYOUT-01 — guide docs use .mrmr/ not murrmure/ as canonical layout", () => {
    const guideRoot = join(REPO_ROOT, "apps/docs/guide");
    const files = collectMarkdownFiles(guideRoot);
    for (const file of files) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const lines = readFileSync(file, "utf-8").split("\n");
      for (const line of lines) {
        if (!LEGACY_MURRMURE_LAYOUT.test(line)) continue;
        expect(line, `${rel}: ${line.trim()}`).toMatch(/legacy/i);
      }
    }
  });

  test("DOC-EXAMPLES-01 — apps/docs must not reference examples/", () => {
    const docsRoot = join(REPO_ROOT, "apps/docs");
    const files = collectMarkdownFiles(docsRoot);
    for (const file of files) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const content = readFileSync(file, "utf-8");
      expect(content, rel).not.toMatch(/examples\/(flows|workers|capabilities)/);
    }
  });

  test("DOC-EXEC-01 — apps/docs markdown bans executor.action", () => {
    const docsRoot = join(REPO_ROOT, "apps/docs");
    const files = collectMarkdownFiles(docsRoot);
    for (const file of files) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const content = readFileSync(file, "utf-8");
      expect(content, rel).not.toMatch(EXECUTOR_ACTION_PATTERN);
    }
  });

  test("SPACE-ROOT-01 — repo root .mrmr/space/handlers.yaml exists and passes strict apply", () => {
    const handlersPath = join(REPO_ROOT, ".mrmr/space/handlers.yaml");
    expect(existsSync(handlersPath)).toBe(true);
    assertStrictApply(REPO_ROOT);
  });
});

describe("phase 10 known-gaps sync (10-U4)", () => {
  test("human and skill-agent known-gaps What works sections match", () => {
    const human = readFileSync(join(REPO_ROOT, "apps/docs/guide/known-gaps.md"), "utf-8");
    const skill = readFileSync(
      join(REPO_ROOT, "packages/cli/skill-agent/reference/known-gaps.md"),
      "utf-8",
    );
    const humanSection = human.match(/## What works today[\s\S]*/)?.[0]?.trim() ?? "";
    const skillSection =
      skill
        .match(/## What works today[\s\S]*/)?.[0]
        ?.trim()
        .replace(
          /See \[Creating flows\]\(\.\/creating-flows\)[^\n]+/,
          "See [Creating flows](./creating-flows) and [Quick start](./quick-start).",
        ) ?? "";
    const normalizeEntities = (text: string) =>
      text.replace(/&#123;/g, "{").replace(/&#125;/g, "}");
    expect(normalizeEntities(humanSection)).toBe(normalizeEntities(skillSection));
  });
});

describe("phase 10 apps/docs FDK grep (10-U6)", () => {
  test("zero FDK terms in apps/docs text sources", async () => {
    const { scanFdkHits } = await import("../../../scripts/lib/fdk-docs-scan.mjs");
    const docsRoot = join(REPO_ROOT, "apps/docs");
    expect(scanFdkHits(docsRoot, REPO_ROOT)).toEqual([]);
  });
});

describe("phase 3 MCP docs guard", () => {
  test("apps/docs excludes fat MCP config references", () => {
    const docsRoot = join(REPO_ROOT, "apps/docs");
    const files = collectMarkdownFiles(docsRoot);
    const forbidden = /murrmure mcp|args.*\["mcp"\]|MURRMURE_SPACE_ID.*mcp|studio-hub-mcp/i;
    for (const file of files) {
      const rel = file.replace(`${REPO_ROOT}/`, "");
      const content = readFileSync(file, "utf-8");
      expect(content, rel).not.toMatch(forbidden);
    }
  });

  test("apps/docs MCP setup references murrmure-mcp", () => {
    const docsRoot = join(REPO_ROOT, "apps/docs");
    const files = collectMarkdownFiles(docsRoot);
    const aggregate = files.map((file) => readFileSync(file, "utf-8")).join("\n");
    expect(aggregate).toContain("murrmure-mcp");
  });
});
