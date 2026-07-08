import { describe, expect, test } from "vitest";
import { FlowManifestSchema } from "@murrmure/contracts";
import { compileFlowIr, parseFlowManifest, rejectInlineScriptSteps } from "../../../src/flow-engine/index.js";

describe("flow-engine/conformance/manifest", () => {
  const validManifest = {
    apiVersion: "murrmure.flow/v1" as const,
    name: "morning-brief",
    start: { manual: true, idempotency: "run_key" },
    steps: [
      {
        id: "research",
        executor: { action: "overnight_research", params: { topic: "{{input.topic}}" } },
        branches: {
          completed: { schema: { type: "object" }, next: "approve" },
          failed: { schema: { type: "object" }, next: null, fail_run: true },
        },
      },
      {
        id: "approve",
        presentation: { view: "review.v1" },
        branches: {
          validated: { schema: { type: "object" }, next: null },
          cancel: { schema: { type: "object" }, next: null, fail_run: true },
        },
      },
    ],
  };

  test("valid step-contract manifest parses and compiles IR with digest", () => {
    const parsed = parseFlowManifest(validManifest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(FlowManifestSchema.parse(validManifest)).toEqual(validManifest);

    const ir = compileFlowIr(parsed.value, "flw_morning_brief");
    expect(ir.flow_id).toBe("flw_morning_brief");
    expect(ir.steps).toHaveLength(2);
    expect(ir.steps[0]?.kind).toBe("step_contract");
    expect(ir.steps[1]?.kind).toBe("step_contract");
    expect(ir.digest).toMatch(/^sha256:/);
  });

  test("rejects legacy invoke/checkpoint at parse time", () => {
    const parsed = parseFlowManifest({
      apiVersion: "murrmure.flow/v1",
      name: "legacy",
      start: { manual: true },
      steps: [{ id: "a", invoke: { space: "spc_x", action: "hello" } }],
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("LEGACY_STEP_KIND");
  });

  test("rejects fat flow with inline script step", () => {
    const guard = rejectInlineScriptSteps({
      apiVersion: "murrmure.flow/v1",
      name: "bad",
      start: { manual: true },
      steps: [{ id: "x", script: "echo bad" }],
    });
    expect(guard.ok).toBe(false);
    if (guard.ok) return;
    expect(guard.code).toBe("INLINE_SCRIPT_STEP");
  });

  test("rejects invalid apiVersion", () => {
    const parsed = parseFlowManifest({
      apiVersion: "flow/v0",
      name: "bad",
      start: { manual: true },
      steps: [],
    });
    expect(parsed.ok).toBe(false);
  });
});
