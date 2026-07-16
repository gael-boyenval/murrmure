import { describe, expect, test } from "vitest";
import { resolveInvokePrompt } from "../src/invoke-shell-prompt.js";

describe("invoke-shell-prompt", () => {
  test("renders handler scope block before active block", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "build-owner",
        space_id: "spc_demo",
        run_id: "run_1",
        session_id: "ses_1",
        space_root: "/tmp/repo",
        murrmure_bindings: {
          run_id: "run_1",
          handlerScopeContract: [
            "## Handler scope",
            "",
            "### Scoped step: build",
            "- Branch `completed`: engine advances",
          ].join("\n"),
          agentStepContract: [
            "## Active step: build.build-loop",
            "",
            "Branch `completed`:",
            'murrmure_resolve_step({ run_id: "run_1", step_id: "build.build-loop", branch: "completed" })',
          ].join("\n"),
        },
      },
      "Own the build subgraph for this run.",
    );

    const scopeIndex = prompt.indexOf("## Handler scope");
    const activeIndex = prompt.indexOf("## Active step: build.build-loop");
    expect(scopeIndex).toBeGreaterThanOrEqual(0);
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(scopeIndex).toBeLessThan(activeIndex);
    const protocolStart = prompt.indexOf("<!-- MURRMURE_PROTOCOL_BEGIN -->\n");
    expect(
      prompt.slice(protocolStart + "<!-- MURRMURE_PROTOCOL_BEGIN -->\n".length),
    ).toMatch(/^Protocol: murrmure\.agent\/v1\n/);
    expect(prompt).not.toContain("## Session");
    expect(prompt).not.toContain("## Resolve API");
  });

  test("does not prepend briefing for handler-style prompt path", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "build-owner",
        space_id: "spc_demo",
        run_id: "run_1",
        session_id: "ses_1",
        space_root: "/tmp/repo",
        params: { spec_path: "specs/current/demo.md" },
        murrmure_bindings: {
          run_id: "run_1",
          handlerScopeContract: "## Handler scope\n\n### Scoped step: build",
          agentStepContract: "## Active step: build.build-loop",
        },
      },
      "Spec: {{spec_path}}",
    );

    expect(prompt).toContain("Spec: specs/current/demo.md");
    expect(prompt).not.toContain("## Space briefing");
    expect(prompt).toContain("<!-- MURRMURE_TASK_BEGIN -->");
    expect(prompt).toContain("<!-- MURRMURE_PROTOCOL_BEGIN -->");
  });

  test("renders discovery only for multi-key prompt scope", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "build-owner",
        space_id: "spc_demo",
        run_id: "run_1",
        murrmure_bindings: {
          run_id: "run_1",
          contractKeyCount: "2",
          agentStepContract: "### Active step: build",
        },
      },
      "Build it.",
    );
    expect(prompt).toContain("## Discovery");
  });
});
