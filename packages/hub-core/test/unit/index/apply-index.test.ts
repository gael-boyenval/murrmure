import { describe, expect, test } from "vitest";
import { applyIndexDiff, validateApplyBundle } from "../../../src/index/apply-index.js";
import type { SpaceApplyBundle, SpaceIndexSnapshot } from "@murrmure/contracts";

const EMPTY: SpaceIndexSnapshot = { actions: [], executors: [], hooks: [], events: [], flows: [] };

const bundle: SpaceApplyBundle = {
  actions: {
    digest: "sha256:abc",
    file: {
      version: 1,
      actions: {
        hello: { executor: "shell" },
      },
    },
  },
  flows: [],
  views: [],
};

describe("index/apply-index", () => {
  test("first apply adds action rows", () => {
    const result = applyIndexDiff(EMPTY, bundle, "spc_demo");
    expect(result.summary.actions).toBe(1);
    expect(result.changes.some((c) => c.change === "added" && c.key === "hello")).toBe(true);
  });

  test("second apply with same digest is idempotent", () => {
    const first = applyIndexDiff(EMPTY, bundle, "spc_demo");
    const second = applyIndexDiff(first.next, bundle, "spc_demo");
    expect(second.summary.changed).toBe(0);
    expect(second.changes.every((c) => c.change === "unchanged")).toBe(true);
  });

  test("flow diff keys rows by flow_id", () => {
    const flowBundle: SpaceApplyBundle = {
      flows: [
        {
          flow_id: "flw_demo",
          rel_path: "flows/demo/flow.manifest.yaml",
          digest: "sha256:flow1",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "demo",
            start: { manual: true },
            steps: [],
          },
        },
      ],
      views: [],
    };
    const first = applyIndexDiff(EMPTY, flowBundle, "spc_demo");
    expect(first.changes.some((c) => c.resource === "flows" && c.key === "flw_demo" && c.change === "added")).toBe(
      true,
    );

    const updatedBundle: SpaceApplyBundle = {
      ...flowBundle,
      flows: [{ ...flowBundle.flows[0], digest: "sha256:flow2" }],
    };
    const second = applyIndexDiff(first.next, updatedBundle, "spc_demo");
    expect(second.changes.some((c) => c.resource === "flows" && c.key === "flw_demo" && c.change === "updated")).toBe(
      true,
    );
  });

  test("partial bundle preserves omitted sections", () => {
    const fullBundle: SpaceApplyBundle = {
      actions: {
        digest: "sha256:abc",
        file: { version: 1, actions: { hello: { executor: "shell" } } },
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
      hooks: {
        digest: "sha256:hooks",
        file: {
          version: 1,
          hooks: {
            on_start: {
              on: { event: { type: "mrmr.test" } },
              do: [{ invoke: { action: "hello" } }],
            },
          },
        },
      },
      flows: [
        {
          flow_id: "flw_demo",
          rel_path: "flows/demo/flow.manifest.yaml",
          digest: "sha256:flow1",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "demo",
            start: { manual: true },
            steps: [],
          },
        },
      ],
      views: [],
    };

    const indexed = applyIndexDiff(EMPTY, fullBundle, "spc_demo");
    const actionsOnly: SpaceApplyBundle = {
      actions: {
        digest: "sha256:abc2",
        file: { version: 1, actions: { hello: { executor: "shell" }, world: { executor: "shell" } } },
      },
    };

    const partial = applyIndexDiff(indexed.next, actionsOnly, "spc_demo");
    expect(partial.next.executors).toEqual(indexed.next.executors);
    expect(partial.next.hooks).toEqual(indexed.next.hooks);
    expect(partial.next.flows).toEqual(indexed.next.flows);
    expect(partial.next.actions).toHaveLength(2);
    expect(partial.changes.some((c) => c.resource === "executors" && c.change === "removed")).toBe(false);
    expect(partial.changes.some((c) => c.resource === "flows" && c.change === "removed")).toBe(false);
  });

  test("empty actions file clears indexed actions", () => {
    const indexed = applyIndexDiff(EMPTY, bundle, "spc_demo");
    const cleared: SpaceApplyBundle = {
      actions: {
        digest: "sha256:empty",
        file: { version: 1, actions: {} },
      },
      flows: [],
      views: [],
    };
    const result = applyIndexDiff(indexed.next, cleared, "spc_demo");
    expect(result.next.actions).toHaveLength(0);
    expect(result.changes.some((c) => c.resource === "actions" && c.change === "removed")).toBe(true);
  });

  test("validateApplyBundle rejects duplicate flow_id", () => {
    const dupBundle: SpaceApplyBundle = {
      flows: [
        {
          flow_id: "flw_dup",
          rel_path: "flows/a/flow.manifest.yaml",
          digest: "sha256:a",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "a",
            start: { manual: true },
            steps: [],
          },
        },
        {
          flow_id: "flw_dup",
          rel_path: "flows/b/flow.manifest.yaml",
          digest: "sha256:b",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "b",
            start: { manual: true },
            steps: [],
          },
        },
      ],
      views: [],
    };
    const result = validateApplyBundle(dupBundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DUPLICATE_FLOW_ID");
  });

  test("validateApplyBundle rejects flow-call cycle", () => {
    const result = validateApplyBundle({
      flows: [
        {
          flow_id: "flw_a",
          rel_path: "flows/a/flow.manifest.yaml",
          digest: "sha256:a",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "a",
            start: { manual: true },
            steps: [{ id: "c", start_flow: { flow_id: "flw_b", input: {} } }],
          },
        },
        {
          flow_id: "flw_b",
          rel_path: "flows/b/flow.manifest.yaml",
          digest: "sha256:b",
          manifest: {
            apiVersion: "murrmure.flow/v1",
            name: "b",
            start: { flow_call: true },
            steps: [{ id: "c", start_flow: { flow_id: "flw_a", input: {} } }],
          },
        },
      ],
      views: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FLOW_CALL_CYCLE");
  });
});
