import { describe, expect, test } from "vitest";
import {
  compileStepContractCatalog,
  lintStepContractManifest,
  manifestUsesStepContracts,
} from "../../../src/flow-engine/step-contract-compile.js";
import { parseFlowManifest } from "../../../src/index/parse-flow-manifest.js";
import type { FlowManifest } from "@murrmure/contracts";

const LINEAR_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "demo",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches spec markdown.",
      branches: {
        continue: { schema: { type: "object" }, route: { step: "write_spec" } },
        cancel: { schema: { type: "object" }, route: { run: "failed" } },
      },
    },
    { id: "write_spec", description: "Write the spec." },
    {
      id: "build",
      description: "Build and review.",
      branches: {
        completed: { schema: { type: "object" }, route: { step: "archive" } },
      },
      steps: [
        {
          id: "build-loop",
          description: "Implement; resolve when preview URL ready.",
          branches: {
            completed: { schema: { type: "object" }, route: { step: "build.review" } },
            failed: { schema: { type: "object" }, route: { run: "failed" } },
          },
        },
        {
          id: "review",
          description: "Human review.",
          branches: {
            validated: { schema: { type: "object" }, resume: "build" },
            changes_required: {
              schema: { type: "object" },
              route: { step: "build.build-loop" },
            },
          },
        },
      ],
    },
    { id: "archive", description: "Archive artifacts." },
    { id: "commit", description: "Commit work." },
  ],
};

describe("flow-engine/step-contract-compile", () => {
  test("detects step contract manifests", () => {
    expect(manifestUsesStepContracts(LINEAR_MANIFEST)).toBe(true);
    expect(
      manifestUsesStepContracts({
        apiVersion: "murrmure.flow/v1",
        name: "legacy",
        triggers: { manual: true },
        steps: [{ id: "x", invoke: { space: "spc_a", action: "hello" } }],
      }),
    ).toBe(false);
  });

  test("flattens nested steps to qualified ids with parent links", () => {
    const { catalog, warnings } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_demo");
    expect(warnings.filter((w) => w.code === "DEAD_STEP")).toEqual([]);
    expect(catalog).not.toBeNull();
    expect(catalog!.step_ids).toContain("build.build-loop");
    expect(catalog!.step_ids).toContain("build.review");
    const nested = catalog!.entries.find((e) => e.step_id === "build.review");
    expect(nested?.parent_id).toBe("build");
  });

  test("compiles branch routes for top-level and nested steps", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_demo");
    const intake = catalog!.entries.find((e) => e.step_id === "intake");
    expect(intake?.branches.continue?.routes).toEqual([{ engine: "open", step_id: "write_spec" }]);
    expect(intake?.branches.cancel?.routes).toEqual([{ engine: "fail_run" }]);

    const loop = catalog!.entries.find((e) => e.step_id === "build.build-loop");
    expect(loop?.branches.completed?.routes).toEqual([
      { engine: "open", step_id: "build.review" },
    ]);
    expect(loop?.branches.failed?.routes).toEqual([{ engine: "fail_run" }]);

    const review = catalog!.entries.find((e) => e.step_id === "build.review");
    expect(review?.branches.validated?.routes).toEqual([{ engine: "resume", step_id: "build" }]);
    expect(review?.branches.changes_required?.routes).toEqual([
      { engine: "open", step_id: "build.build-loop" },
    ]);
  });

  test("default branches: completed opens next sibling, failed fails the run", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_demo");
    const writeSpec = catalog!.entries.find((e) => e.step_id === "write_spec");
    expect(writeSpec?.branches.completed?.routes).toEqual([{ engine: "open", step_id: "build" }]);
    expect(writeSpec?.branches.failed?.routes).toEqual([{ engine: "fail_run" }]);
  });

  test("last top-level default completed compiles to terminal success (advance, not open null)", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_demo");
    const commit = catalog!.entries.find((e) => e.step_id === "commit");
    expect(commit?.branches.completed?.routes).toEqual([{ engine: "advance" }]);
    expect(commit?.branches.failed?.routes).toEqual([{ engine: "fail_run" }]);
  });

  test("omitted branches inject completed/failed defaults that are semantically identical to explicit ones", () => {
    const implicit = compileStepContractCatalog(
      {
        apiVersion: "murrmure.flow/v1",
        name: "one",
        triggers: { manual: true },
        steps: [{ id: "only", description: "only" }],
      },
      "flw_one",
    );
    const explicit = compileStepContractCatalog(
      {
        apiVersion: "murrmure.flow/v1",
        name: "one",
        triggers: { manual: true },
        steps: [
          {
            id: "only",
            description: "only",
            branches: {
              completed: { schema: { type: "object" } },
              failed: { schema: { type: "object" } },
            },
          },
        ],
      },
      "flw_one",
    );
    expect(implicit.catalog?.entries[0]?.branches).toEqual(
      explicit.catalog?.entries[0]?.branches,
    );
  });

  test("lint rejects empty explicit branch maps", () => {
    const warnings = lintStepContractManifest(
      {
        apiVersion: "murrmure.flow/v1",
        name: "empty",
        triggers: { manual: true },
        steps: [{ id: "x", branches: {} }],
      },
      "flw_empty",
    );
    expect(warnings.some((w) => w.code === "EMPTY_BRANCHES")).toBe(true);
  });

  test("lint requires explicit routes for custom top-level branches", () => {
    const warnings = lintStepContractManifest(
      {
        apiVersion: "murrmure.flow/v1",
        name: "custom",
        triggers: { manual: true },
        steps: [{ id: "only", branches: { weird: { schema: { type: "object" } } } }],
      },
      "flw_custom",
    );
    expect(warnings.some((w) => w.code === "CUSTOM_BRANCH_REQUIRES_ROUTE")).toBe(true);
  });

  test("lint reports dead steps", () => {
    const warnings = lintStepContractManifest(
      {
        apiVersion: "murrmure.flow/v1",
        name: "dead",
        triggers: { manual: true },
        steps: [
          { id: "start", branches: { done: { schema: { type: "object" }, route: { run: "completed" } } } },
          { id: "orphan", branches: { done: { schema: { type: "object" }, route: { run: "completed" } } } },
        ],
      },
      "flw_dead",
    );
    expect(warnings.some((w) => w.code === "DEAD_STEP" && w.step_id === "orphan")).toBe(true);
  });

  test("lint reports legacy invoke via raw scan", () => {
    const raw = {
      apiVersion: "murrmure.flow/v1" as const,
      name: "legacy",
      triggers: { manual: true },
      steps: [{ id: "a", invoke: { space: "spc_x", action: "hello" } }],
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

  test("compiles independent branch resolve contracts and rejects payload/artifact collisions", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "files",
      triggers: { manual: true },
      steps: [{
        id: "intake",
        branches: {
          file_only: {
            schema: { type: "object", required: ["spec"] },
            artifact_slots: { spec: { min_bytes: 1, max_bytes: 10 } },
            route: { run: "completed" },
          },
          mixed: {
            schema: {
              type: "object",
              required: ["reviewer", "attachment"],
              properties: { reviewer: { type: "string" } },
            },
            artifact_slots: { attachment: {} },
            route: { run: "completed" },
          },
        },
      }],
    };
    const compiled = compileStepContractCatalog(manifest, "flw_files");
    const branches = compiled.catalog!.entries[0]!.branches;
    expect(branches.file_only).toMatchObject({
      payload_required: [],
      artifact_required: ["spec"],
      artifact_slots: { spec: { min_bytes: 1, max_bytes: 10 } },
    });
    expect(branches.mixed).toMatchObject({
      payload_required: ["reviewer"],
      artifact_required: ["attachment"],
    });
    expect(compiled.catalog!.entries[0]).not.toHaveProperty("artifact_slots");

    const collision = structuredClone(manifest);
    collision.steps[0]!.branches!.file_only!.schema = {
      type: "object",
      required: ["spec"],
      properties: { spec: { type: "string" } },
    };
    expect(
      compileStepContractCatalog(collision, "flw_collision").warnings,
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PAYLOAD_ARTIFACT_NAME_COLLISION" }),
    ]));
  });
});
