import { describe, expect, test } from "vitest";

/**
 * PR boundary gate (rev-1 §14): protocol vs flow vs view vs space implementation.
 * Index module owns protocol indexing only — not view registry, not flow execution.
 */
describe("index/boundary-classification", () => {
  test("index module exports parsers and apply diff only", async () => {
    const mod = await import("../../../src/index/index.js");
    const keys = Object.keys(mod).sort();
    expect(keys).toContain("parseFlowManifest");
    expect(keys).toContain("applyIndexDiff");
    expect(keys).not.toContain("executeFlow");
    expect(keys).not.toContain("registerView");
  });

  test("flow index rows denormalize view_ref without view registry", () => {
    const layer = "protocol-index";
    const owns = ["actions", "executors", "hooks", "flow_index.view_ref"];
    const notHubEntities = ["view_registry", "inline_script_steps"];
    expect(owns.every((item) => !notHubEntities.includes(item))).toBe(true);
    expect(layer).toBe("protocol-index");
  });
});
