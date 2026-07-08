import { describe, expect, test } from "vitest";
import { parseFlowManifest, rejectInlineScriptSteps } from "../../../src/index/parse-flow-manifest.js";

const VALID_MANIFEST = {
  apiVersion: "murrmure.flow/v1",
  name: "demo",
  start: { manual: true },
  steps: [
    {
      id: "a",
      executor: { action: "hello" },
      branches: { completed: { schema: { type: "object" }, next: null } },
    },
  ],
};

describe("index/parse-flow-manifest", () => {
  test("parses valid step-contract manifest", () => {
    const result = parseFlowManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
  });

  test("rejects legacy invoke at parse time", () => {
    const result = parseFlowManifest({
      ...VALID_MANIFEST,
      steps: [{ id: "a", invoke: { space: "spc_demo", action: "hello" } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("LEGACY_STEP_KIND");
    }
  });

  test("rejects inline script step", () => {
    const result = rejectInlineScriptSteps({
      ...VALID_MANIFEST,
      steps: [{ id: "bad", script: "echo hi" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INLINE_SCRIPT_STEP");
    }
  });

  test("rejects inline script in parallel.lane", () => {
    const result = rejectInlineScriptSteps({
      ...VALID_MANIFEST,
      steps: [
        {
          id: "parallel",
          parallel: {
            lane: [{ id: "bad", run: "echo hi" }],
          },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INLINE_SCRIPT_STEP");
      expect(result.message).toContain("parallel.lane");
    }
  });
});
