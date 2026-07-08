import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lintSpaceApplyBundle,
  strictLintFailures,
  ENGINE_DISPATCH_KINDS,
} from "../../../src/flow-engine/engine-capabilities.js";
import type { FlowManifest, SpaceApplyBundle } from "@murrmure/contracts";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../studio-specs/current/fixtures/space-apply",
);

function loadFixture(name: string): SpaceApplyBundle {
  const raw = JSON.parse(readFileSync(join(FIXTURES, name), "utf-8")) as { bundle: SpaceApplyBundle };
  return raw.bundle;
}

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

describe("flow-engine/engine-capabilities", () => {
  test("ENGINE_DISPATCH_KINDS includes gate/checkpoint", () => {
    expect(ENGINE_DISPATCH_KINDS).toContain("invoke");
    expect(ENGINE_DISPATCH_KINDS).toContain("gate");
    expect(ENGINE_DISPATCH_KINDS).toContain("checkpoint");
  });

  test("unsupported-step-kind fixture", () => {
    const warnings = lintSpaceApplyBundle(loadFixture("unsupported-step-kind.json"));
    expect(warnings.some((w) => w.code === "UNSUPPORTED_STEP_KIND" && w.step_id === "hold")).toBe(true);
    expect(strictLintFailures(warnings).length).toBeGreaterThan(0);
  });

  test("checkpoint-on-resolve-missing fixture emits LEGACY_STEP_KIND (VS-8)", () => {
    const warnings = lintSpaceApplyBundle(loadFixture("checkpoint-on-resolve-missing.json"));
    expect(warnings.some((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
    expect(strictLintFailures(warnings).length).toBeGreaterThan(0);
  });

  test("empty on_resolve.default/cancel objects fail strict lint with LEGACY_STEP_KIND (VS-8)", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "empty-routes",
      start: { manual: true },
      steps: [
        {
          id: "intake",
          checkpoint: {
            view: "my-view",
            on_resolve: { default: {}, cancel: {} },
          },
        },
        { id: "build", invoke: { space: "spc_demo", action: "build" } },
      ],
    };
    const warnings = lintSpaceApplyBundle(
      minimalBundle(manifest, [
        {
          view_id: "my-view",
          rel_path: "views/my-view/view.manifest.yaml",
          digest: "sha256:view1",
          manifest: { apiVersion: "murrmure.view/v1", id: "my-view", entry: "dist/index.html" },
          build: { dist_present: true, entry_present: true },
        },
      ]),
    );
    expect(warnings.some((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
    expect(strictLintFailures(warnings).some((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
  });

  test("view without build metadata on legacy checkpoint emits LEGACY_STEP_KIND (VS-8)", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "no-build-meta",
      start: { manual: true },
      steps: [
        {
          id: "intake",
          checkpoint: {
            view: "my-view",
            on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
          },
        },
        { id: "done", invoke: { space: "spc_demo", action: "build" } },
      ],
    };
    const warnings = lintSpaceApplyBundle(
      minimalBundle(manifest, [
        {
          view_id: "my-view",
          rel_path: "views/my-view/view.manifest.yaml",
          digest: "sha256:view1",
          manifest: { apiVersion: "murrmure.view/v1", id: "my-view", entry: "dist/index.html" },
        },
      ]),
    );
    expect(warnings.some((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
    expect(strictLintFailures(warnings).some((w) => w.code === "LEGACY_STEP_KIND")).toBe(true);
  });

  test("loopback hint satisfied by on_resolve.default.goto", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "loopback-default",
      start: { manual: true },
      steps: [
        { id: "build", invoke: { space: "spc_demo", action: "build" } },
        {
          id: "review",
          checkpoint: {
            view: "my-view",
            on_resolve: {
              default: { goto: "build" },
              cancel: { fail: true },
            },
          },
        },
      ],
    };
    const warnings = lintSpaceApplyBundle(
      minimalBundle(manifest, [
        {
          view_id: "my-view",
          rel_path: "views/my-view/view.manifest.yaml",
          digest: "sha256:view1",
          manifest: { apiVersion: "murrmure.view/v1", id: "my-view", entry: "dist/index.html" },
          build: { dist_present: true, entry_present: true },
        },
      ]),
    );
    expect(warnings.some((w) => w.code === "CHECKPOINT_LOOPBACK_HINT")).toBe(false);
  });

  test("triggers.requires_view emits LEGACY_START_REQUIRES_VIEW", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "legacy-triggers-view",
      start: { manual: true },
      triggers: { manual: true, requires_view: "intake-form" },
      steps: [{ id: "hello", invoke: { space: "spc_demo", action: "build" } }],
    };
    const warnings = lintSpaceApplyBundle(minimalBundle(manifest));
    expect(
      warnings.some(
        (w) =>
          w.code === "LEGACY_START_REQUIRES_VIEW" &&
          w.message.includes("triggers.requires_view 'intake-form'"),
      ),
    ).toBe(true);
    expect(strictLintFailures(warnings).some((w) => w.code === "LEGACY_START_REQUIRES_VIEW")).toBe(true);
  });
});
