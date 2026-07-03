import { describe, expect, test } from "vitest";
import {
  buildFlowCallGraph,
  collectStartFlowTargets,
  detectCycleInGraph,
  detectFlowCallCycles,
} from "../../../src/flow-engine/cycle-detect.js";
import type { FlowManifest } from "@murrmure/contracts";

const manifest = (steps: FlowManifest["steps"], name = "test"): FlowManifest => ({
  apiVersion: "murrmure.flow/v1",
  name,
  start: { manual: true },
  steps,
});

describe("flow-engine/cycle-detect", () => {
  test("collectStartFlowTargets finds nested start_flow refs", () => {
    const m = manifest([
      { id: "a", invoke: { space: "spc_x", action: "noop" } },
      { id: "b", start_flow: { flow_id: "flw_child", input: {} } },
    ]);
    expect(collectStartFlowTargets(m)).toEqual(["flw_child"]);
  });

  test("detectCycleInGraph finds A → B → A", () => {
    const graph = new Map<string, string[]>([
      ["flw_a", ["flw_b"]],
      ["flw_b", ["flw_a"]],
    ]);
    const cycle = detectCycleInGraph(graph);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("flw_a");
    expect(cycle).toContain("flw_b");
  });

  test("detectFlowCallCycles rejects cycle at apply time", () => {
    const result = detectFlowCallCycles({
      flows: [
        {
          flow_id: "flw_a",
          manifest: manifest([{ id: "call_b", start_flow: { flow_id: "flw_b", input: {} } }], "a"),
        },
        {
          flow_id: "flw_b",
          manifest: manifest([{ id: "call_a", start_flow: { flow_id: "flw_a", input: {} } }], "b"),
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FLOW_CALL_CYCLE");
    }
  });

  test("detectFlowCallCycles accepts DAG", () => {
    const graph = buildFlowCallGraph([
      {
        flow_id: "flw_parent",
        manifest: manifest([{ id: "call_child", start_flow: { flow_id: "flw_child", input: {} } }]),
      },
      {
        flow_id: "flw_child",
        manifest: manifest([{ id: "work", invoke: { space: "spc_x", action: "noop" } }], "child"),
      },
    ]);
    expect(detectCycleInGraph(graph)).toBeNull();
  });
});
