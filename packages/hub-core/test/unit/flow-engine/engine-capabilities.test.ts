import { describe, expect, test } from "vitest";
import {
  lintSpaceApplyBundle,
  strictLintFailures,
  ENGINE_DISPATCH_KINDS,
} from "../../../src/flow-engine/engine-capabilities.js";
import type { FlowManifest, SpaceApplyBundle } from "@murrmure/contracts";

function minimalBundle(manifest: FlowManifest, views: SpaceApplyBundle["views"] = []): SpaceApplyBundle {
  return {
    actions: {
      digest: "sha256:actions1",
      file: { version: 1, actions: { build: { executor: "shell" } } },
    },
    executors: {
      digest: "sha256:exec1",
      file: { executors: { shell: { binding: { type: "shell_spawn", executor_id: "shell" } } } },
    },
    hooks: { digest: "sha256:hooks1", file: { version: 1, hooks: {} } },
    flows: [
      {
        flow_id: "flw_test",
        rel_path: "flows/test/flow.manifest.yaml",
        digest: "sha256:flow1",
        manifest,
      },
    ],
    views,
  };
}

function linearManifest(): FlowManifest {
  return {
    apiVersion: "murrmure.flow/v1",
    name: "linear",
    triggers: { manual: true },
    steps: [
      {
        id: "intake",
        description: "intake",
        branches: {
          continue: { route: { step: "work" } },
          cancel: { route: { run: "failed" } },
        },
      },
      { id: "work", description: "work" },
    ],
  };
}

describe("flow-engine/engine-capabilities", () => {
  test("ENGINE_DISPATCH_KINDS includes invoke/gate/checkpoint/step_contract", () => {
    expect(ENGINE_DISPATCH_KINDS).toContain("invoke");
    expect(ENGINE_DISPATCH_KINDS).toContain("gate");
    expect(ENGINE_DISPATCH_KINDS).toContain("checkpoint");
    expect(ENGINE_DISPATCH_KINDS).toContain("step_contract");
  });

  test("clean step-contract bundle lints with no warnings", () => {
    const warnings = lintSpaceApplyBundle(minimalBundle(linearManifest()));
    expect(warnings).toEqual([]);
    expect(strictLintFailures(warnings)).toEqual([]);
  });

  test("DEAD_STEP surfaces for an unreachable top-level step", () => {
    // intake routes directly to `work`, skipping `orphan`; nothing routes to orphan.
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "dead",
      triggers: { manual: true },
      steps: [
        { id: "intake", description: "intake", branches: { continue: { route: { step: "work" } } } },
        { id: "orphan", description: "orphan" },
        { id: "work", description: "work" },
      ],
    };
    const warnings = lintSpaceApplyBundle(minimalBundle(manifest));
    expect(warnings.some((w) => w.code === "DEAD_STEP" && w.step_id === "orphan")).toBe(true);
    expect(strictLintFailures(warnings).some((w) => w.code === "DEAD_STEP")).toBe(true);
  });

  test("EMPTY_BRANCHES surfaces for branches: {}", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "empty-branches",
      triggers: { manual: true },
      steps: [{ id: "intake", description: "intake", branches: {} }],
    };
    const warnings = lintSpaceApplyBundle(minimalBundle(manifest));
    expect(warnings.some((w) => w.code === "EMPTY_BRANCHES" && w.step_id === "intake")).toBe(true);
  });

  test("CUSTOM_BRANCH_REQUIRES_ROUTE surfaces for a custom top-level branch without route", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "custom-no-route",
      triggers: { manual: true },
      steps: [
        {
          id: "intake",
          description: "intake",
          branches: { retry: { schema: { type: "object" } } },
        },
        { id: "work", description: "work" },
      ],
    };
    const warnings = lintSpaceApplyBundle(minimalBundle(manifest));
    expect(
      warnings.some((w) => w.code === "CUSTOM_BRANCH_REQUIRES_ROUTE" && w.step_id === "intake"),
    ).toBe(true);
  });

  test("unbound steps (no handlers, no executor) are valid and produce no warnings", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "unbound",
      triggers: { manual: true },
      steps: [{ id: "intake", description: "intake" }],
    };
    const warnings = lintSpaceApplyBundle(minimalBundle(manifest));
    expect(warnings).toEqual([]);
  });
});
