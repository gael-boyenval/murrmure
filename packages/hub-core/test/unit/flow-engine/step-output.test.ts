import { describe, expect, test } from "vitest";
import {
  mergeCheckpointOutputIntoInput,
  mergeStepOutputIntoExecContext,
  shouldMergeCheckpointInput,
} from "../../../src/flow-engine/exec-context.js";
import { resolveStepParams } from "../../../src/flow-engine/templates.js";

describe("flow-engine/step-output", () => {
  test("mergeStepOutputIntoExecContext stores action result", () => {
    const next = mergeStepOutputIntoExecContext(
      { input: { topic: "news" } },
      "build",
      {
        status: "completed",
        output: { preview_url: "http://localhost:3000" },
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(
      (next.steps as Record<string, { output: Record<string, unknown> }>).build.output.preview_url,
    ).toBe("http://localhost:3000");
  });

  test("{{steps.build.output.x}} resolves in invoke params", () => {
    const execContext = mergeStepOutputIntoExecContext(
      { input: {} },
      "build",
      {
        status: "completed",
        output: { preview_url: "http://localhost:3000", message: "hello" },
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    );
    const params = resolveStepParams(
      {
        url: "{{steps.build.output.preview_url}}",
        feedback: "{{steps.review.output.comments}}",
      },
      execContext,
    );
    expect(params?.url).toBe("http://localhost:3000");
    expect(params?.feedback).toBe("");
  });

  test("step 0 checkpoint output merges into input by default", () => {
    expect(shouldMergeCheckpointInput(0)).toBe(true);
    expect(shouldMergeCheckpointInput(1)).toBe(false);
    expect(shouldMergeCheckpointInput(1, true)).toBe(true);
    const merged = mergeCheckpointOutputIntoInput({}, { reviewer: "bob", preview_url: "http://x" });
    expect(merged.input).toEqual({ reviewer: "bob", preview_url: "http://x" });
  });
});
