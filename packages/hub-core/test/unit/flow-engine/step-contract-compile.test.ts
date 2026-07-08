import { describe, expect, test } from "vitest";
import {
  compileStepContractCatalog,
  lintStepContractManifest,
  manifestUsesStepContracts,
} from "../../../src/flow-engine/step-contract-compile.js";
import { parseFlowManifest } from "../../../src/flow-engine/parse.js";
import type { FlowManifest } from "@murrmure/contracts";

const LINEAR_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "preview-review-v2",
  start: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches spec markdown.",
      presentation: { view: "preview-review-intake" },
      branches: {
        continue: { schema: { type: "object" }, next: "write_spec" },
        cancel: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "write_spec",
      executor: {
        action: "feature_write_spec",
        params: { spec_filename: "{{input.spec_filename}}" },
      },
      branches: {
        completed: { schema: { type: "object" }, next: "build" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "build",
      orchestration: "engine-routed",
      executor: {
        action: "feature_build",
        params: { spec_filename: "{{murrmure.step.write_spec.artifact.spec.path}}" },
      },
      steps: [
        {
          id: "build-loop",
          description: "Implement site; resolve when preview URL ready.",
          branches: {
            completed: {
              schema: { type: "object", properties: { preview_url: { type: "string" } } },
              goto: "review",
            },
            failed: { schema: { type: "object" }, fail: true },
          },
        },
        {
          id: "review",
          presentation: { view: "preview-review", assignees: ["{{input.reviewer}}"] },
          branches: {
            validated: { schema: { type: "object" }, complete: "parent" },
            changes_required: {
              schema: { type: "object" },
              continue: "parent",
              goto: "build-loop",
            },
            cancel: { schema: { type: "object" }, fail: true },
          },
        },
      ],
      branches: {
        completed: { schema: { type: "object" }, next: "archive" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "archive",
      executor: { action: "feature_archive" },
      branches: {
        completed: { schema: { type: "object" }, next: "commit" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "commit",
      executor: { action: "feature_commit" },
      branches: {
        completed: { schema: { type: "object" }, next: null },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
  ],
};

describe("flow-engine/step-contract-compile", () => {
  test("detects step contract manifests", () => {
    expect(manifestUsesStepContracts(LINEAR_MANIFEST)).toBe(true);
    expect(
      manifestUsesStepContracts({
        apiVersion: "murrmure.flow/v1",
        name: "legacy",
        start: { manual: true },
        steps: [{ id: "x", invoke: { space: "spc_a", action: "hello" } }],
      }),
    ).toBe(false);
  });

  test("flattens nested steps to qualified ids", () => {
    const { catalog, warnings } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    expect(warnings.filter((w) => w.code === "DEAD_STEP")).toEqual([]);
    expect(catalog).not.toBeNull();
    expect(catalog!.step_ids).toContain("build.build-loop");
    expect(catalog!.step_ids).toContain("build.review");
    const nested = catalog!.entries.find((e) => e.step_id === "build.review");
    expect(nested?.parent_id).toBe("build");
    expect(nested?.role).toBe("human");
    const agent = catalog!.entries.find((e) => e.step_id === "build.build-loop");
    expect(agent?.role).toBe("agent");
  });

  test("compiles branch routes for top-level and nested steps", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const intake = catalog!.entries.find((e) => e.step_id === "intake");
    expect(intake?.branches.continue?.routes).toEqual([{ engine: "open", step_id: "write_spec" }]);
    expect(intake?.branches.cancel?.routes).toEqual([{ engine: "fail_run", fail_run: true }]);

    const review = catalog!.entries.find((e) => e.step_id === "build.review");
    expect(review?.branches.validated?.routes).toEqual([{ engine: "complete_parent" }]);
    expect(review?.branches.changes_required?.routes).toEqual([
      { engine: "continue_parent" },
      { engine: "goto", step_id: "build.build-loop" },
    ]);
  });

  test("lint rejects unknown murrmure tokens", () => {
    const bad: FlowManifest = {
      ...LINEAR_MANIFEST,
      steps: [
        {
          id: "write_spec",
          executor: {
            action: "feature_write_spec",
            params: { path: "{{murrmure.unknown_token}}" },
          },
          branches: {
            completed: { schema: { type: "object" }, next: null },
          },
        },
      ],
    };
    const warnings = lintStepContractManifest(bad, "flw_bad");
    expect(warnings.some((w) => w.code === "UNKNOWN_MURRMURE_TOKEN")).toBe(true);
  });

  test("lint reports dead steps", () => {
    const bad: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "dead",
      start: { manual: true },
      steps: [
        {
          id: "start",
          branches: { done: { schema: { type: "object" }, next: null } },
        },
        {
          id: "orphan",
          branches: { done: { schema: { type: "object" }, next: null } },
        },
      ],
    };
    const warnings = lintStepContractManifest(bad, "flw_dead");
    expect(warnings.some((w) => w.code === "DEAD_STEP" && w.step_id === "orphan")).toBe(true);
  });

  test("lint reports legacy invoke/checkpoint via raw scan", () => {
    const raw = {
      apiVersion: "murrmure.flow/v1" as const,
      name: "legacy",
      start: { manual: true },
      steps: [
        { id: "a", invoke: { space: "spc_x", action: "hello" } },
        { id: "b", checkpoint: { view: "v", on_resolve: { default: { goto: "a" }, cancel: { fail: true } } } },
      ],
    };
    const parsed = parseFlowManifest(raw);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("LEGACY_STEP_KIND");
  });

  test("catalog digest is stable for same manifest", () => {
    const a = compileStepContractCatalog(LINEAR_MANIFEST, "flw_x").catalog;
    const b = compileStepContractCatalog(LINEAR_MANIFEST, "flw_x").catalog;
    expect(a?.digest).toBe(b?.digest);
    expect(a?.graph_digest).toBe(b?.graph_digest);
  });
});
