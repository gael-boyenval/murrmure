import { describe, expect, test } from "vitest";
import {
  formatInvokeShellPrompt,
  resolveActionTemplate,
  resolveInvokePrompt,
} from "../src/invoke-shell-prompt.js";
import {
  resolveShellCommand,
  resolveShellPrompt,
  shellQuote,
} from "../src/shell-spawn.js";
import type { DispatchContext, InvokeRequest } from "@murrmure/runtime-contracts";

describe("shell-spawn helpers", () => {
  test("shellQuote escapes single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'"'"'s'`);
  });

  test("resolveActionTemplate substitutes invoke params", () => {
    const prompt = resolveActionTemplate(
      "Task: {{instruction}}\nTopic: {{topic}}",
      { instruction: "Write file", topic: "mcp" },
    );
    expect(prompt).toContain("Write file");
    expect(prompt).toContain("Topic: mcp");
  });

  test("resolveInvokePrompt uses action prompt template", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "run_feedback_agent",
        space_id: "spc_test",
        run_id: "run_1",
        session_id: "ses_1",
        space_root: "/tmp/repo",
        params: {
          kind: "improvement",
          instruction: "Write under feedbacks/",
          topic: "mcp",
          summary: "test",
        },
      },
      "Kind: {{kind}}\n{{instruction}}\nTopic: {{topic}}",
    );
    expect(prompt).toContain("Kind: improvement");
    expect(prompt).toContain("Write under feedbacks/");
    expect(prompt).toContain("Topic: mcp");
  });

  test("formatInvokeShellPrompt fallback includes instruction and data", () => {
    const prompt = formatInvokeShellPrompt("write_improvement_feedback", {
      instruction: "Write under feedbacks/",
      topic: "mcp",
      summary: "test",
    });
    expect(prompt).toContain("Write under feedbacks/");
    expect(prompt).toContain('"topic": "mcp"');
  });

  test("resolveShellCommand uses {{prompt}} from action template", () => {
    const invoke: InvokeRequest = {
      space_id: "spc_test",
      action_name: "run_feedback_agent",
      params: { instruction: "Do the thing", kind: "failure" },
    };
    const context: DispatchContext = {
      action: {
        name: "run_feedback_agent",
        prompt: "Kind: {{kind}}\n{{instruction}}",
        command: "cursor agent -p --force {{prompt}}",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
    };
    expect(resolveShellCommand(invoke, context)).toBe(
      "cursor agent -p --force 'Kind: failure\nDo the thing'",
    );
    expect(resolveShellPrompt(invoke, context)).toBe("Kind: failure\nDo the thing");
  });

  test("resolveShellCommand substitutes individual params in command", () => {
    const invoke: InvokeRequest = {
      space_id: "spc_test",
      action_name: "run_feedback_agent",
      params: { instruction: "Do the thing" },
    };
    const context: DispatchContext = {
      action: {
        name: "run_feedback_agent",
        command: "cursor agent -p --force {{instruction}}",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
    };
    expect(resolveShellCommand(invoke, context)).toBe(
      "cursor agent -p --force 'Do the thing'",
    );
  });
});
