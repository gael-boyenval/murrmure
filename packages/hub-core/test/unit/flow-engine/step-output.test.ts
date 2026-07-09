import { describe, expect, test } from "vitest";
import {
  appendShellStreamToRun,
  mergeStepOutputIntoExecContext,
  shouldMergeCheckpointInput,
  mergeCheckpointOutputIntoInput,
} from "../../../src/flow-engine/exec-context.js";
import { resolveStepParams } from "../../../src/flow-engine/templates.js";

describe("flow-engine/step-output", () => {
  test("appendShellStreamToRun accumulates stdout chunks", async () => {
    const runs = new Map<string, { exec_context: Record<string, unknown> }>();
    const studio = {
      getRun: async (id: string) => {
        const row = runs.get(id);
        return row ? { ...row, flow_id: "flw_1", flow_digest: "sha256:x" } : null;
      },
      updateRunFlowBinding: async (id: string, input: { exec_context: Record<string, unknown> }) => {
        const row = runs.get(id);
        if (row) row.exec_context = input.exec_context;
      },
    };
    runs.set("abc", { exec_context: { steps: {} } });
    await appendShellStreamToRun(studio as never, {
      run_id: "run_abc",
      step_id: "write_spec",
      stream: "stdout",
      chunk: "line 1\n",
    });
    await appendShellStreamToRun(studio as never, {
      run_id: "run_abc",
      step_id: "write_spec",
      stream: "stdout",
      chunk: "line 2\n",
    });
    const step = (runs.get("abc")!.exec_context.steps as Record<string, { output: Record<string, unknown> }>)
      .write_spec;
    expect(step.output.stdout).toBe("line 1\nline 2\n");
    expect(step.output.streaming).toBe(true);
  });

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

  test("mergeStepOutputIntoExecContext preserves prior resolve output when shell result arrives", () => {
    const withResolve = mergeStepOutputIntoExecContext(
      {
        steps: {
          write_spec: {
            output: { spec_path: "specs/current/feature.md", branch: "completed" },
          },
        },
      },
      "write_spec",
      {
        status: "completed",
        output: { ok: true, stdout: "done" },
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    );
    const step = (withResolve.steps as Record<string, { output: Record<string, unknown> }>).write_spec;
    expect(step.output.spec_path).toBe("specs/current/feature.md");
    expect(step.output.stdout).toBe("done");
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
