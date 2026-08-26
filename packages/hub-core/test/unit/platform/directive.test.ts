import { describe, expect, test } from "vitest";
import type { HandlerSpec } from "@murrmure/contracts";
import {
  DIRECTIVE_FLOW_ID,
  DIRECTIVE_FLOW_NAME,
  DIRECTIVE_STEP_ALIAS,
  buildDirectiveFlowEntry,
  flowsIncludingPlatformForHandlers,
  handlerBindsDirective,
  mergePlatformFlows,
} from "../../../src/platform/directive.js";
import { extractRunStepResult } from "../../../src/platform/run-result.js";
import { lintSpaceApplyBundle } from "../../../src/flow-engine/engine-capabilities.js";

const DIRECTIVE_HANDLER: HandlerSpec = {
  id: "directive",
  contract_keys: [DIRECTIVE_STEP_ALIAS],
  on: `step.opened::${DIRECTIVE_STEP_ALIAS}`,
  type: "shell_spawn",
  complete: "explicit",
  prompt: "{{input.prompt}}",
  command: "cursor agent -p --force {{prompt}}",
};

describe("platform/directive", () => {
  test("handlerBindsDirective matches the opened alias only", () => {
    expect(handlerBindsDirective(DIRECTIVE_HANDLER)).toBe(true);
    expect(
      handlerBindsDirective({
        ...DIRECTIVE_HANDLER,
        on: `step.resolved::${DIRECTIVE_STEP_ALIAS}`,
      }),
    ).toBe(false);
    expect(
      handlerBindsDirective({
        ...DIRECTIVE_HANDLER,
        on: { event: { type: "mrmr.meeting.said" } },
      }),
    ).toBe(false);
  });

  test("mergePlatformFlows indexes the hub flow only when a handler is bound", () => {
    expect(mergePlatformFlows([], []).map((flow) => flow.flow_id)).toEqual([]);
    const merged = mergePlatformFlows([], [DIRECTIVE_HANDLER]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.flow_id).toBe(DIRECTIVE_FLOW_ID);
    expect(merged[0]?.name).toBe(DIRECTIVE_FLOW_NAME);
    expect(merged[0]?.origin_space_id).toBe("spc_mrmr_platform");
    expect(merged[0]?.step_contract_catalog?.step_ids).toEqual(["execute"]);
  });

  test("mergePlatformFlows does not duplicate an already-present directive flow", () => {
    const existing = buildDirectiveFlowEntry();
    expect(mergePlatformFlows([existing], [DIRECTIVE_HANDLER])).toEqual([existing]);
  });

  test("buildDirectiveFlowEntry compiles completed/failed message branches", () => {
    const entry = buildDirectiveFlowEntry();
    const execute = entry.step_contract_catalog?.entries.find((row) => row.step_id === "execute");
    expect(execute?.branches.completed?.payload_required).toEqual(["message"]);
    expect(execute?.branches.failed?.payload_required).toEqual(["message"]);
  });

  test("lint includes the platform flow so contract_keys are not orphans", () => {
    const warnings = lintSpaceApplyBundle({
      handlers: {
        digest: "sha256:directive-handlers",
        file: { version: 1, run_policies: [], handlers: [DIRECTIVE_HANDLER] },
      },
      flows: [],
    });
    expect(warnings.filter((warning) => warning.code === "HANDLER_ORPHAN_KEY")).toEqual([]);
  });

  test("flowsIncludingPlatformForHandlers no-ops without a binding", () => {
    expect(flowsIncludingPlatformForHandlers([], [])).toEqual([]);
    expect(flowsIncludingPlatformForHandlers([], [DIRECTIVE_HANDLER])).toHaveLength(1);
  });
});

describe("platform/run-result", () => {
  test("extracts execute.message from exec_context", () => {
    expect(
      extractRunStepResult({
        input: { prompt: "ping" },
        steps: {
          execute: { status: "completed", output: { message: "pong" } },
        },
      }),
    ).toEqual({ step_id: "execute", status: "completed", message: "pong" });
  });

  test("returns undefined when no step output exists", () => {
    expect(extractRunStepResult({ input: { prompt: "ping" } })).toBeUndefined();
  });
});
