import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { lintSpaceApplyBundle, strictLintFailures } from "@murrmure/hub-core";
import { spaceFlowInitCommand } from "../src/commands/space/flow-init.js";
import { scaffoldFlowPackage, assertSafeFlowId } from "../src/lib/flow-scaffold.js";
import { readSpaceApplyBundle } from "../src/lib/space-directory.js";
import {
  writeMinimalViewDist,
} from "./helpers/link-view-scaffold-deps.js";

describe("space flow init scaffold", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "cli-space-flow-init-"));
    mkdirSync(join(targetDir, "murrmure"), { recursive: true });
  });

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true });
  });

  test("hello-gate creates preview-review tree with role comments", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate");

    const expected = [
      "actions.yaml",
      "executors.yaml",
      "flows/preview-review/flow.manifest.yaml",
      "scripts/preview-review-build.mjs",
      "views/preview-review/package.json",
      "views/preview-review-intake/package.json",
      "hooks.yaml",
    ];

    for (const rel of expected) {
      expect(existsSync(join(murrmureRoot, rel)), rel).toBe(true);
    }

    const manifest = parseYaml(
      readFileSync(join(murrmureRoot, "flows/preview-review/flow.manifest.yaml"), "utf-8"),
    ) as Record<string, unknown>;
    expect(manifest.triggers).toEqual({ manual: true });
    expect(manifest.start).toEqual({ manual: true });

    const steps = manifest.steps as Array<Record<string, unknown>>;
    expect(steps.map((s) => s.id)).toEqual(["intake", "build", "review", "done"]);

    const intake = steps[0].checkpoint as { view: string; on_resolve: unknown };
    expect(intake.view).toBe("preview-review-intake");
    expect(intake.on_resolve).toMatchObject({
      default: { goto: "build" },
      cancel: { fail: true },
    });

    const build = steps[1].invoke as { action: string };
    expect(build.action).toBe("preview-review_run_preview_agent");

    const review = steps[2].checkpoint as {
      view: string;
      on_resolve: { when: string; values: Record<string, unknown> };
    };
    expect(review.view).toBe("preview-review");
    expect(review.on_resolve.when).toBe("output.outcome");
    expect(review.on_resolve.values).toMatchObject({
      validated: { goto: "done" },
      changes_required: { goto: "build" },
    });

    const done = steps[3].invoke as { action: string };
    expect(done.action).toBe("preview-review_mark_validated");

    const flowManifestRaw = readFileSync(
      join(murrmureRoot, "flows/preview-review/flow.manifest.yaml"),
      "utf-8",
    );
    expect(flowManifestRaw.startsWith("# Role:")).toBe(true);
    expect(readFileSync(join(murrmureRoot, "scripts/preview-review-build.mjs"), "utf-8")).toMatch(
      /MURRMURE_INPUT/,
    );
  });

  test("hello-gate merges flow-scoped actions for multiple flows", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate");
    scaffoldFlowPackage(murrmureRoot, "content-review", "hello-gate");

    const actions = parseYaml(readFileSync(join(murrmureRoot, "actions.yaml"), "utf-8")) as {
      actions: Record<string, { command: string }>;
    };

    expect(actions.actions["preview-review_run_preview_agent"].command).toContain(
      "preview-review-build.mjs",
    );
    expect(actions.actions["content-review_run_preview_agent"].command).toContain(
      "content-review-build.mjs",
    );
    expect(actions.actions["preview-review_mark_validated"]).toBeDefined();
    expect(actions.actions["content-review_mark_validated"]).toBeDefined();
  });

  test("rejects flow ids with control characters", () => {
    expect(() => assertSafeFlowId("preview\nreview")).toThrow(/control characters/);
    expect(() => assertSafeFlowId("preview\rreview")).toThrow(/control characters/);
    expect(() => assertSafeFlowId("preview\x00review")).toThrow(/control characters/);
    expect(() => scaffoldFlowPackage(join(targetDir, "murrmure"), "bad\ttab", "hello-gate")).toThrow(
      /control characters/,
    );
  });

  test("hello-invoke scaffolds invoke-only flow", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "demo", "hello-invoke");

    expect(existsSync(join(murrmureRoot, "flows/demo/flow.manifest.yaml"))).toBe(true);
    expect(existsSync(join(murrmureRoot, "scripts/demo-hello.mjs"))).toBe(true);
    expect(existsSync(join(murrmureRoot, "views"))).toBe(false);

    const manifest = parseYaml(
      readFileSync(join(murrmureRoot, "flows/demo/flow.manifest.yaml"), "utf-8"),
    ) as { steps: Array<{ invoke?: { action: string } }> };
    expect(manifest.steps[0]?.invoke?.action).toBe("demo_hello");
  });

  test("rejects duplicate flow id", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate");
    expect(() => scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate")).toThrow(
      /already exists/,
    );
  });

  test("command scaffolds from space root", async () => {
    await (spaceFlowInitCommand as { run: (ctx: unknown) => Promise<void> }).run({
      args: { id: "preview-review", template: "hello-gate", json: true, "space-root": targetDir },
      rawArgs: [],
    });

    expect(existsSync(join(targetDir, "murrmure/flows/preview-review/flow.manifest.yaml"))).toBe(
      true,
    );
  });

  test("space apply strict fails on legacy scaffold until VS-8 migration", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate");

    writeMinimalViewDist(join(murrmureRoot, "views/preview-review"));
    writeMinimalViewDist(join(murrmureRoot, "views/preview-review-intake"));

    const bundle = readSpaceApplyBundle(targetDir);
    const warnings = lintSpaceApplyBundle(bundle);
    const strictFailures = strictLintFailures(warnings);
    expect(strictFailures.every((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
    expect(strictFailures.length).toBeGreaterThan(0);
    expect(bundle.flows?.some((f) => f.flow_id === "flw_flows_preview_review")).toBe(true);
  });

  test("scaffolded view package.json declares vite build script", () => {
    const murrmureRoot = join(targetDir, "murrmure");
    scaffoldFlowPackage(murrmureRoot, "preview-review", "hello-gate");
    const viewDir = join(murrmureRoot, "views/preview-review");
    const pkg = JSON.parse(readFileSync(join(viewDir, "package.json"), "utf-8")) as {
      scripts?: { build?: string };
    };

    expect(pkg.scripts?.build).toBe("vite build");
    expect(existsSync(join(viewDir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(viewDir, "src/App.tsx"))).toBe(true);
  });
});

describe("space flow init snapshot paths", () => {
  test("hello-gate relative tree matches fixture manifest", () => {
    const murrmureRoot = mkdtempSync(join(tmpdir(), "cli-flow-snapshot-"));
    try {
      mkdirSync(join(murrmureRoot, "murrmure"), { recursive: true });
      scaffoldFlowPackage(join(murrmureRoot, "murrmure"), "preview-review", "hello-gate");

      const root = join(murrmureRoot, "murrmure");
      const relFiles: string[] = [];
      const walk = (dir: string) => {
        for (const entry of ["actions.yaml", "executors.yaml", "hooks.yaml"]) {
          const p = join(root, entry);
          if (existsSync(p)) relFiles.push(entry);
        }
        for (const sub of [
          "flows/preview-review/flow.manifest.yaml",
          "scripts/preview-review-build.mjs",
          "views/preview-review/view.manifest.yaml",
          "views/preview-review-intake/view.manifest.yaml",
        ]) {
          if (existsSync(join(root, sub))) relFiles.push(sub);
        }
      };
      walk(root);
      relFiles.sort();
      expect(relFiles).toEqual([
        "actions.yaml",
        "executors.yaml",
        "flows/preview-review/flow.manifest.yaml",
        "hooks.yaml",
        "scripts/preview-review-build.mjs",
        "views/preview-review-intake/view.manifest.yaml",
        "views/preview-review/view.manifest.yaml",
      ]);
    } finally {
      rmSync(murrmureRoot, { recursive: true, force: true });
    }
  });
});
