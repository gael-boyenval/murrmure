import { describe, expect, test } from "vitest";
import {
  formatInvokeShellPrompt,
  resolveActionTemplate,
  resolveInvokePrompt,
} from "../src/invoke-shell-prompt.js";
import {
  createShellSpawnExecutor,
  resolveShellCommand,
  resolveShellPrompt,
  shellQuote,
} from "../src/shell-spawn.js";
import type { DispatchContext, InvokeRequest } from "@murrmure/runtime-contracts";
import { EventEmitter } from "node:events";

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

  test("resolveInvokePrompt ignores legacy space briefing bindings", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "feature_build",
        space_id: "spc_test",
        run_id: "run_1",
        space_root: "/tmp/repo",
        params: { spec_path: "specs/current/demo.md" },
        murrmure_bindings: {
          spaceBriefing: "## Actions\n- feature_build",
          spaceBriefingPath: ".mrmr/dev/briefing.md",
        },
      },
      "Spec: {{spec_path}}",
    );
    expect(prompt).toContain("Spec: specs/current/demo.md");
    expect(prompt).not.toContain("Space briefing");
  });

  test("resolveInvokePrompt separates task and Murrmure protocol", () => {
    const prompt = resolveInvokePrompt(
      {
        action_name: "feature_build",
        space_id: "spc_test",
        run_id: "run_1",
        session_id: "ses_1",
        space_root: "/tmp/repo",
        params: { spec_path: "specs/current/demo.md" },
        murrmure_bindings: {
          run_id: "run_1",
          agentStepContract: "## Active step: build\nWorkdir: .mrmr/dev/.../work",
        },
        step_contract_path: "/tmp/repo/.mrmr/dev/runs/run_1/active-step-contract.json",
        step_workdir: "/tmp/repo/.mrmr/dev/runs/run_1/steps/build/work",
      },
      "Follow `agent.md`.\nSpec: {{spec_path}}\n\n{{murrmure.agentStepContract}}\n\nRun {{run_id}}",
    );
    expect(prompt).toContain("<!-- MURRMURE_TASK_BEGIN -->");
    expect(prompt).toContain("# Task");
    expect(prompt).toContain("Follow `agent.md`.");
    expect(prompt).toContain("Spec: specs/current/demo.md");
    expect(prompt).not.toContain("{{murrmure.agentStepContract}}");
    expect(prompt).toContain("<!-- MURRMURE_PROTOCOL_BEGIN -->");
    expect(prompt).toContain("## Active step: build");
  });

  test("resolveShellCommand pipes {{prompt}} via stdin instead of argv", () => {
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
    expect(resolveShellCommand(invoke, context)).toBe("cursor agent -p --force");
    expect(resolveShellPrompt(invoke, context)).toBe("Kind: failure\nDo the thing");
  });

  test("resolveShellCommand uses stdin for actions with prompt templates", () => {
    const invoke: InvokeRequest = {
      space_id: "spc_test",
      action_name: "feature_build",
      params: {},
    };
    const context: DispatchContext = {
      action: {
        name: "feature_build",
        prompt: "Follow `agent.md` and `skills/feature-build/SKILL.md`.",
        command: "cursor agent -p --force --approve-mcps --trust",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
    };
    expect(resolveShellCommand(invoke, context)).toBe(
      "cursor agent -p --force --approve-mcps --trust",
    );
  });

  test("resolveShellCommand keeps small param substitution in argv", () => {
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

  test("injects resolve token and hub url into shell env", async () => {
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const spawnStub = ((command: string, options: { env?: NodeJS.ProcessEnv }) => {
      capturedEnv = options.env;
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from('{"ok":true}'));
        child.emit("close", 0);
      });
      void command;
      return child as never;
    }) as unknown as typeof import("node:child_process").spawn;

    const executor = createShellSpawnExecutor({ spawn: spawnStub });
    const invoke: InvokeRequest = {
      space_id: "spc_demo",
      action_name: "build-owner",
      run_id: "run_demo",
      session_id: "ses_demo",
      step_id: "build.build-loop",
      params: {},
    };
    const context: DispatchContext = {
      action: {
        name: "build-owner",
        command: "node -e \"process.stdout.write('{}')\"",
        prompt: "hello",
      },
      binding: { type: "shell_spawn", executor_id: "shell" },
      space_root: "/tmp/repo",
      step_contract: {
        slice_json: "{}",
        contract_path: "/tmp/repo/.mrmr/dev/runs/run_demo/active-step-contract.json",
        workdir: "/tmp/repo/.mrmr/dev/runs/run_demo/steps/build.build-loop/work",
        prompt_bindings: { run_id: "run_demo" },
        hub_token: "tok_run_scoped",
        hub_url: "http://127.0.0.1:8787",
      },
    };

    const outcome = await executor.dispatch(invoke, context);
    expect(outcome.status).toBe("dispatched");
    expect(capturedEnv?.MURRMURE_HUB_TOKEN).toBe("tok_run_scoped");
    expect(capturedEnv?.MURRMURE_HUB_URL).toBe("http://127.0.0.1:8787");
    expect(capturedEnv?.MURRMURE_RUN_ID).toBe("run_demo");
    expect(capturedEnv?.MURRMURE_STEP_ID).toBe("build.build-loop");
  });
});
