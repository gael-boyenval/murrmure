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
        invoke: { space: "spc_research", action: "overnight_research", params: { topic: "{{input.topic}}" } },
      },
      {
        id: "approve",
        gate: { form: { id: "review.v1", fields: [] }, assignees: ["reviewer"] },
      },
    ],
  };

  test("valid manifest parses and compiles IR with digest", () => {
    const parsed = parseFlowManifest(validManifest);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(FlowManifestSchema.parse(validManifest)).toEqual(validManifest);

    const ir = compileFlowIr(parsed.value, "flw_morning_brief");
    expect(ir.flow_id).toBe("flw_morning_brief");
    expect(ir.steps).toHaveLength(2);
    expect(ir.steps[0]?.kind).toBe("invoke");
    expect(ir.steps[1]?.kind).toBe("gate");
    expect(ir.digest).toMatch(/^sha256:/);
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
