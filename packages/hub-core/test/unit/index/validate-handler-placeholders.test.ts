import { describe, expect, test } from "vitest";
import {
  validateHandlerPlaceholders,
  placeholderQuickFixHint,
  buildStepOutputMurrmureBindings,
  buildMurrmurePromptBindings,
  buildStepContractSlice,
  compileStepContractCatalog,
} from "@murrmure/hub-core";
import type { HandlerSpec } from "@murrmure/contracts";

const FLOW = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "my-dev-flow",
  triggers: { manual: true },
  steps: [
    { id: "build", description: "build" },
    { id: "cleanup", description: "cleanup" },
  ],
};

describe("handler placeholders — step output + apply gate", () => {
  test("placeholderQuickFixHint rewrites legacy steps.* and murrmure.steps.*", () => {
    expect(placeholderQuickFixHint("steps.build.output.commit_message")).toContain(
      "{{murrmure.step.build.output.commit_message}}",
    );
    expect(placeholderQuickFixHint("murrmure.steps.build.output.description")).toContain(
      "{{murrmure.step.build.output.description}}",
    );
    expect(placeholderQuickFixHint("murrmure.run.id")).toContain("{{murrmure.run_id}}");
  });

  test("buildStepOutputMurrmureBindings flattens resolve fields", () => {
    const bindings = buildStepOutputMurrmureBindings({
      steps: {
        build: {
          output: {
            commit_message: "feat: x",
            description: "body",
            nested: { url: "http://x" },
          },
        },
      },
    });
    expect(bindings["step.build.output.commit_message"]).toBe("feat: x");
    expect(bindings["step.build.output.description"]).toBe("body");
    expect(bindings["step.build.output.nested.url"]).toBe("http://x");
  });

  test("buildMurrmurePromptBindings includes step output keys", () => {
    const { catalog } = compileStepContractCatalog(FLOW, "flw_test");
    const cleanup = catalog!.entries.find((e) => e.step_id === "cleanup")!;
    const exec_context = {
      steps: {
        build: { output: { commit_message: "feat: ship", description: "done" } },
      },
    };
    const slice = buildStepContractSlice({
      entry: cleanup,
      exec_context,
      run_id: "run_01",
      space_root: "/tmp/space",
    });
    const bindings = buildMurrmurePromptBindings({
      slice,
      space_root: "/tmp/space",
      run_id: "run_01",
      exec_context,
    });
    expect(bindings["step.build.output.commit_message"]).toBe("feat: ship");
    expect(bindings["step.build.output.description"]).toBe("done");
  });

  test("validateHandlerPlaceholders accepts canonical murrmure.step output tokens", () => {
    const handlers: HandlerSpec[] = [
      {
        id: "cleanup",
        type: "shell_spawn",
        on: "step.opened::my-dev-flow.cleanup",
        complete: "auto",
        contract_keys: [],
        command:
          "git commit -m {{murrmure.step.build.output.commit_message}} -m {{murrmure.step.build.output.description}}",
      },
    ];
    expect(
      validateHandlerPlaceholders({ handlers, step_ids: ["build", "cleanup"] }),
    ).toEqual({ ok: true });
  });

  test("validateHandlerPlaceholders rejects legacy steps.* with quick-fix", () => {
    const handlers: HandlerSpec[] = [
      {
        id: "cleanup",
        type: "shell_spawn",
        on: "step.opened::my-dev-flow.cleanup",
        complete: "auto",
        contract_keys: [],
        command: "git commit -m {{steps.build.output.commit_message}}",
      },
    ];
    const result = validateHandlerPlaceholders({ handlers, step_ids: ["build", "cleanup"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("HANDLER_UNKNOWN_PLACEHOLDER");
    expect(result.message).toContain("{{murrmure.step.build.output.commit_message}}");
  });

  test("validateHandlerPlaceholders rejects quoted placeholders", () => {
    const handlers: HandlerSpec[] = [
      {
        id: "cleanup",
        type: "shell_spawn",
        on: "step.opened::my-dev-flow.cleanup",
        complete: "auto",
        contract_keys: [],
        command: 'git commit -m "{{murrmure.step.build.output.commit_message}}"',
      },
    ];
    const result = validateHandlerPlaceholders({ handlers, step_ids: ["build", "cleanup"] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("HANDLER_PLACEHOLDER_QUOTED");
  });
});
