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

  test("substitutes flow input.prompt on handler templates", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "directive",
        space_id: "spc_demo",
        run_id: "run_1",
        params: { prompt: "Say pong", input: { prompt: "Say pong" } },
      },
      "{{input.prompt}}",
    );
    expect(prompt).toBe("Say pong");
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

  test("injects meeting protocol for convene wake params", () => {
    const goal = "Developer: draft the public list approach";
    const prompt = resolveInvokePrompt(
      {
        action_name: "meeting-developer",
        space_id: "spc_demo",
        run_id: "run_1",
        session_id: "ses_room",
        params: {
          session_id: "ses_room",
          participant_id: "ptc_dev",
          trigger: "convened",
          since_seq: 0,
          goal,
        },
      },
      "You are the developer seat. Address the goal.",
    );
    expect(prompt).toContain("You are the developer seat. Address the goal.");
    expect(prompt).toContain("Protocol: murrmure.meeting/v1");
    expect(prompt).toContain("session_id: ses_room");
    expect(prompt).toContain("participant_id: ptc_dev");
    expect(prompt).toContain("trigger: convened");
    expect(prompt).toContain(`goal: ${goal}`);
    expect(prompt).toContain("without waiting for a chair repeat");
    expect(prompt).toContain("Do not call murrmure_resolve_step for this room.");
  });

  test("resume wake keeps trigger resumed and the verbatim goal", () => {
    const goal = "QA: re-run the flake list";
    const prompt = resolveInvokePrompt(
      {
        action_name: "meeting-qa",
        space_id: "spc_demo",
        session_id: "ses_room",
        params: {
          session_id: "ses_room",
          participant_id: "ptc_qa",
          trigger: "resumed",
          since_seq: 0,
          goal,
        },
      },
      "Continue as the QA seat.",
    );
    expect(prompt).toContain("trigger: resumed");
    expect(prompt).toContain(`goal: ${goal}`);
    expect(prompt).not.toContain("trigger: convened");
  });

  test("later said wake includes the verbatim goal", () => {
    const goal = "Researcher: attach the latency notes";
    const prompt = resolveInvokePrompt(
      {
        action_name: "meeting-researcher",
        space_id: "spc_demo",
        session_id: "ses_room",
        params: {
          session_id: "ses_room",
          participant_id: "ptc_res",
          trigger: "said",
          message_id: "msg_01ARZ3NDEKTSV4RRFFQ69G5FA1",
          since_seq: 4,
          goal,
        },
      },
      "A new message arrived.",
    );
    expect(prompt).toContain("trigger: said");
    expect(prompt).toContain(`goal: ${goal}`);
    expect(prompt).toContain("already joined");
  });

  test("hard-fails unknown prompt placeholders with quick-fix", () => {
    expect(() =>
      resolveInvokePrompt(
        {
          action_name: "cleanup",
          space_id: "spc_demo",
          run_id: "run_1",
        },
        "Subject: {{steps.build.output.commit_message}}",
      ),
    ).toThrow(/murrmure\.step\.build\.output\.commit_message/);
  });
});
