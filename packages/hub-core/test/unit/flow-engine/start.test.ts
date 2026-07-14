import { describe, expect, test } from "vitest";
import type { FlowIndexEntry, FlowManifest } from "@murrmure/contracts";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import {
  isFlowCallStartAllowed,
  isManualStartAllowed,
  matchesFlowStartEvent,
  prepareFlowStart,
} from "../../../src/flow-engine/start.js";

function entry(triggers: FlowManifest["triggers"], flowId = "flw_test"): FlowIndexEntry {
  const manifest: FlowManifest = {
    apiVersion: "murrmure.flow/v1",
    name: flowId,
    triggers,
    steps: [{ id: "work", description: "work" }],
  };
  const ir = compileFlowIr(manifest, flowId);
  return {
    flow_id: flowId,
    origin_space_id: "spc_origin",
    digest: ir.digest,
    name: manifest.name,
    triggers,
    step_spaces: ["spc_origin"],
    grants_required: ["flow:run"],
    ir,
  };
}

const RUN_CAPS = ["flow:run"] as const;

describe("flow-engine/start — invoke-only eligibility", () => {
  test("triggers: {} is invoke-only: no manual, no flow_call, no events", () => {
    const e = entry({});
    expect(isManualStartAllowed(e)).toBe(false);
    expect(isFlowCallStartAllowed(e)).toBe(false);
    expect(matchesFlowStartEvent(e, { type: "anything" })).toBe(false);
  });

  test("triggers: { manual: true } allows manual start", () => {
    expect(isManualStartAllowed(entry({ manual: true }))).toBe(true);
  });

  test("triggers: { flow_call: true } is invoke-only for manual clients", () => {
    const e = entry({ flow_call: true });
    expect(isManualStartAllowed(e)).toBe(false);
    expect(isFlowCallStartAllowed(e)).toBe(true);
  });

  test("prepareFlowStart rejects manual start for triggers: {} with MANUAL_START_DISABLED", () => {
    const result = prepareFlowStart(entry({}), {
      exec_context: {},
      origin_space_id: "spc_origin",
      capabilities: [...RUN_CAPS],
      mode: "manual",
    });
    expect("code" in result).toBe(true);
    if ("code" in result) expect(result.code).toBe("MANUAL_START_DISABLED");
  });

  test("prepareFlowStart rejects manual start for flow_call-only with MANUAL_START_DISABLED", () => {
    const result = prepareFlowStart(entry({ flow_call: true }), {
      exec_context: {},
      origin_space_id: "spc_origin",
      capabilities: [...RUN_CAPS],
      mode: "manual",
    });
    expect("code" in result).toBe(true);
    if ("code" in result) expect(result.code).toBe("MANUAL_START_DISABLED");
  });

  test("prepareFlowStart rejects flow_call start for triggers: {} with FLOW_CALL_DISABLED", () => {
    const result = prepareFlowStart(entry({}), {
      exec_context: {},
      origin_space_id: "spc_origin",
      capabilities: [...RUN_CAPS],
      mode: "flow_call",
    });
    expect("code" in result).toBe(true);
    if ("code" in result) expect(result.code).toBe("FLOW_CALL_DISABLED");
  });

  test("prepareFlowStart allows manual start when triggers.manual is true", () => {
    const result = prepareFlowStart(entry({ manual: true }), {
      exec_context: {},
      origin_space_id: "spc_origin",
      capabilities: [...RUN_CAPS],
      mode: "manual",
    });
    expect("code" in result).toBe(false);
    if (!("code" in result)) expect(result.flow_digest).toMatch(/^sha256:/);
  });
});
