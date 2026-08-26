import { describe, expect, test, vi } from "vitest";
import {
  formatInvokeShellPrompt,
  resolveActionTemplate,
  resolveInvokePrompt,
} from "../src/invoke-shell-prompt.js";
import {
  createShellSpawnExecutor,
  extractContinuationToken,
  extractMintToken,
  meetingContinuationStatePath,
  type PersistentShellSessionController,
  resolveShellCommand,
  resolveShellInvocation,
  resolveShellPrompt,
  shellQuote,
} from "../src/shell-spawn.js";
import type { DispatchContext, InvokeRequest } from "@murrmure/runtime-contracts";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("shell-spawn helpers", () => {
  test("shellQuote escapes single quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'"'"'s'`);
  });

  test("extracts an opaque continuation token from JSONL", () => {
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "chat_123" }),
      JSON.stringify({ type: "result", session_id: "chat_123" }),
    ].join("\n");
    expect(extractContinuationToken(stdout, "session_id")).toBe("chat_123");
  });

  test("extracts a plain mint chat id line", () => {
    expect(extractMintToken("8e7eb1d0-1199-4301-a37a-d7fe286ff199\n", "session_id")).toBe(
      "8e7eb1d0-1199-4301-a37a-d7fe286ff199",
    );
  });

  test("resolves a continuation command with the saved token", () => {
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "said",
        since_seq: 2,
      },
    };
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent -p {{prompt}}",
        continuation: {
          command: "cursor agent --resume {{continuation_token}} -p {{prompt}}",
          token_field: "session_id",
        },
        prompt: "Continue the room",
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: "/tmp/demo",
    };
    const resolved = resolveShellInvocation(invoke, context, undefined, {
      command: context.action.continuation!.command,
      continuation_token: "chat_123",
    });
    expect(resolved.command).toBe("cursor agent --resume 'chat_123' -p");
    expect(resolved.stdin_prompt).toContain("Continue the room");
    expect(
      meetingContinuationStatePath({
        space_root: "/tmp/demo",
        session_id: "ses_room",
        participant_id: "ptc_developer",
        action_name: "meeting-developer",
      }),
    ).toContain("/meeting-seats/ses_room/ptc_developer/meeting-developer.json");
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
    let capturedArgs: string[] | undefined;
    const spawnStub = ((
      binary: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      capturedArgs = args;
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
      void binary;
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
    expect(capturedArgs?.[0]).toBe("-e");
    expect(capturedArgs?.[1]).toBe("-c");
    expect(capturedArgs?.[2]).toBe('node -e "process.stdout.write(\'{}\')"');
    expect(capturedEnv?.MURRMURE_HUB_TOKEN).toBe("tok_run_scoped");
    expect(capturedEnv?.MURRMURE_HUB_URL).toBe("http://127.0.0.1:8787");
    expect(capturedEnv?.MURRMURE_ASSIGNMENT_SCOPE).toBe(
      "run_demo:build.build-loop:build-owner",
    );
    expect(capturedEnv?.MURRMURE_RUN_ID).toBe("run_demo");
    expect(capturedEnv?.MURRMURE_STEP_ID).toBe("build.build-loop");
  });

  test("persists the first cursor chat id and resumes it on the next meeting turn", async () => {
    const root = mkdtempSync(join(tmpdir(), "murrmure-meeting-continuation-"));
    const commands: string[] = [];
    const environments: NodeJS.ProcessEnv[] = [];
    const spawnStub = ((
      _binary: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      commands.push(args[2]!);
      environments.push(options.env ?? {});
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        unref: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.stdout.emit(
          "data",
          Buffer.from(
            `${JSON.stringify({
              type: "system",
              subtype: "init",
              session_id: "cursor_chat_1",
            })}\n`,
          ),
        );
        child.emit("close", 0);
      });
      return child as never;
    }) as unknown as typeof import("node:child_process").spawn;
    const onShellComplete = vi.fn();
    const executor = createShellSpawnExecutor({ spawn: spawnStub, onShellComplete });
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent -p {{prompt}}",
        continuation: {
          command: "cursor agent --resume {{continuation_token}} -p {{prompt}}",
          token_field: "session_id",
        },
        prompt: "Continue the meeting",
        timeout_ms: 10_000,
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: root,
    };
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      run_id: "run_1",
      step_id: "hook:meeting-developer",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "convened",
        since_seq: 0,
      },
    };

    try {
      await executor.dispatch(invoke, context);
      const statePath = meetingContinuationStatePath({
        space_root: root,
        session_id: "ses_room",
        participant_id: "ptc_developer",
        action_name: "meeting-developer",
      });
      await vi.waitFor(() => {
        expect(JSON.parse(readFileSync(statePath, "utf8")).token).toBe("cursor_chat_1");
      });

      await executor.dispatch(
        {
          ...invoke,
          run_id: "run_2",
          params: {
            ...invoke.params,
            trigger: "said",
            message_id: "msg_2",
            since_seq: 2,
          },
        },
        context,
      );
      expect(commands).toEqual([
        "cursor agent -p",
        "cursor agent --resume 'cursor_chat_1' -p",
      ]);
      expect(environments[0]).toMatchObject({
        MURRMURE_MEETING_SESSION_ID: "ses_room",
        MURRMURE_MEETING_PARTICIPANT_ID: "ptc_developer",
      });
      expect(environments[0]?.MURRMURE_ASSIGNMENT_SCOPE).toBeUndefined();
      await vi.waitFor(() => expect(onShellComplete).toHaveBeenCalledTimes(2));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps one PTY alive until the meeting assignment closes", async () => {
    const writes: string[] = [];
    let spawnedCommand = "";
    let exitListener:
      | ((event: { exitCode: number; signal?: number }) => void)
      | undefined;
    const pty = {
      pid: 4242,
      cols: 120,
      rows: 40,
      process: "cursor",
      handleFlowControl: false,
      onData: () => ({ dispose: () => undefined }),
      onExit: (listener: typeof exitListener) => {
        exitListener = listener;
        return { dispose: () => undefined };
      },
      resize: () => undefined,
      clear: () => undefined,
      write: (data: string | Buffer) => writes.push(String(data)),
      kill: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
    };
    let controller: PersistentShellSessionController | undefined;
    const onShellComplete = vi.fn();
    const executor = createShellSpawnExecutor({
      spawnPty: vi.fn((_file, args) => {
        spawnedCommand = String(args[2] ?? "");
        return pty as never;
      }),
      onPersistentSessionStart: (input) => {
        controller = input.controller;
      },
      onShellComplete,
    });
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      run_id: "run_seat",
      step_id: "hook:meeting-developer",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "convened",
        since_seq: 0,
      },
    };
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent --force {{prompt}}",
        prompt: "Stay in this meeting.",
        session: {
          mode: "persistent",
          transport: "pty",
          shutdown_grace_ms: 5_000,
        },
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: "/tmp/demo",
    };

    const outcome = await executor.dispatch(invoke, context);
    expect(outcome.status).toBe("dispatched");
    expect(spawnedCommand).toContain("Stay in this meeting.");
    expect(writes).toEqual([]);
    expect(controller).toBeDefined();
    expect(onShellComplete).not.toHaveBeenCalled();

    controller!.write("New message in this meeting.");
    await vi.waitFor(() => {
      expect(writes.some((chunk) => chunk.includes("New message in this meeting."))).toBe(true);
      expect(writes).toContain("\r");
    });

    const closing = controller!.close("meeting_closed");
    expect(writes).toContain("\x04");
    exitListener?.({ exitCode: 0 });
    await closing;
    await vi.waitFor(() =>
      expect(onShellComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: expect.objectContaining({
            status: "completed",
            result: expect.objectContaining({ persistent_session: true }),
          }),
        }),
      ),
    );
  });

  test("writes a multiline later turn as a file path plus Enter", async () => {
    const writes: string[] = [];
    const pty = {
      pid: 4243,
      cols: 120,
      rows: 40,
      process: "cursor",
      handleFlowControl: false,
      onData: () => ({ dispose: () => undefined }),
      onExit: () => ({ dispose: () => undefined }),
      resize: () => undefined,
      clear: () => undefined,
      write: (data: string | Buffer) => writes.push(String(data)),
      kill: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
    };
    let controller: PersistentShellSessionController | undefined;
    const executor = createShellSpawnExecutor({
      spawnPty: vi.fn(() => pty as never),
      onPersistentSessionStart: (input) => {
        controller = input.controller;
      },
    });
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      run_id: "run_seat",
      step_id: "hook:meeting-developer",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "convened",
        since_seq: 0,
      },
    };
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent --force {{prompt}}",
        prompt: "Stay in this meeting.",
        session: {
          mode: "persistent",
          transport: "pty",
          shutdown_grace_ms: 5_000,
        },
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: "/tmp/demo",
    };

    await executor.dispatch(invoke, context);
    controller!.write("New message in this meeting.\n\nfrom: human chair\ntext: hello");
    await vi.waitFor(() => {
      expect(writes.some((chunk) => chunk.includes("murrmure-live-turns"))).toBe(true);
      expect(writes.some((chunk) => chunk.includes("Read "))).toBe(true);
      expect(writes).toContain("\r");
    });
  });

  test("mints a chat id then starts the persistent PTY with --resume", async () => {
    const root = mkdtempSync(join(tmpdir(), "murrmure-meeting-mint-"));
    const mintScripts: string[] = [];
    const spawnStub = ((
      _binary: string,
      args: string[],
    ) => {
      mintScripts.push(String(args[2] ?? ""));
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { write: () => boolean; end: () => void };
        unref: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write: () => true, end: () => undefined };
      child.unref = () => undefined;
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from("chat-mint-99\n"));
        child.emit("close", 0);
      });
      return child as never;
    }) as unknown as typeof import("node:child_process").spawn;
    let spawnedPtyCommand = "";
    const executor = createShellSpawnExecutor({
      spawn: spawnStub,
      spawnPty: vi.fn((_file, args) => {
        spawnedPtyCommand = String(args[2] ?? "");
        return {
          pid: 5150,
          cols: 120,
          rows: 40,
          process: "cursor",
          handleFlowControl: false,
          onData: () => ({ dispose: () => undefined }),
          onExit: () => ({ dispose: () => undefined }),
          resize: () => undefined,
          clear: () => undefined,
          write: () => undefined,
          kill: () => undefined,
          pause: () => undefined,
          resume: () => undefined,
        } as never;
      }),
    });
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      run_id: "run_seat",
      step_id: "hook:meeting-developer",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "convened",
        since_seq: 0,
      },
    };
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent --force {{prompt}}",
        continuation: {
          command: "cursor agent --resume {{continuation_token}} --force {{prompt}}",
          token_field: "session_id",
          mint_command: "cursor agent create-chat",
        },
        prompt: "Stay in this meeting.",
        session: {
          mode: "persistent",
          transport: "pty",
          shutdown_grace_ms: 5_000,
        },
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: root,
    };

    try {
      const outcome = await executor.dispatch(invoke, context);
      expect(outcome.status).toBe("dispatched");
      expect(mintScripts.some((script) => script.includes("create-chat"))).toBe(true);
      expect(spawnedPtyCommand).toContain("--resume");
      expect(spawnedPtyCommand).toContain("chat-mint-99");
      const statePath = meetingContinuationStatePath({
        space_root: root,
        session_id: "ses_room",
        participant_id: "ptc_developer",
        action_name: "meeting-developer",
      });
      expect(JSON.parse(readFileSync(statePath, "utf8")).token).toBe("chat-mint-99");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reuses a stored chat id and skips mint on the next persistent PTY", async () => {
    const root = mkdtempSync(join(tmpdir(), "murrmure-meeting-resume-"));
    const statePath = meetingContinuationStatePath({
      space_root: root,
      session_id: "ses_room",
      participant_id: "ptc_developer",
      action_name: "meeting-developer",
    });
    mkdirSync(join(root, ".mrmr", "dev", "meeting-seats", "ses_room", "ptc_developer"), {
      recursive: true,
    });
    writeFileSync(
      statePath,
      `${JSON.stringify({
        protocol: "murrmure.meeting-continuation/v1",
        token: "stored-chat-7",
        token_field: "session_id",
        updated_at: "2026-08-26T00:00:00.000Z",
      })}\n`,
    );
    const mintScripts: string[] = [];
    const spawnStub = ((
      _binary: string,
      args: string[],
    ) => {
      mintScripts.push(String(args[2] ?? ""));
      throw new Error("mint should not run when a token is already stored");
    }) as unknown as typeof import("node:child_process").spawn;
    let spawnedPtyCommand = "";
    const executor = createShellSpawnExecutor({
      spawn: spawnStub,
      spawnPty: vi.fn((_file, args) => {
        spawnedPtyCommand = String(args[2] ?? "");
        return {
          pid: 5151,
          cols: 120,
          rows: 40,
          process: "cursor",
          handleFlowControl: false,
          onData: () => ({ dispose: () => undefined }),
          onExit: () => ({ dispose: () => undefined }),
          resize: () => undefined,
          clear: () => undefined,
          write: () => undefined,
          kill: () => undefined,
          pause: () => undefined,
          resume: () => undefined,
        } as never;
      }),
    });
    const invoke: InvokeRequest = {
      action_name: "meeting-developer",
      space_id: "spc_demo",
      session_id: "ses_room",
      run_id: "run_seat",
      step_id: "hook:meeting-developer",
      params: {
        session_id: "ses_room",
        participant_id: "ptc_developer",
        trigger: "resumed",
        since_seq: 4,
      },
    };
    const context: DispatchContext = {
      action: {
        name: "meeting-developer",
        command: "cursor agent --force {{prompt}}",
        continuation: {
          command: "cursor agent --resume {{continuation_token}} --force {{prompt}}",
          token_field: "session_id",
          mint_command: "cursor agent create-chat",
        },
        prompt: "Stay in this meeting.",
        session: {
          mode: "persistent",
          transport: "pty",
          shutdown_grace_ms: 5_000,
        },
      },
      binding: { type: "shell_spawn", executor_id: "handler:meeting-developer" },
      space_root: root,
    };

    try {
      const outcome = await executor.dispatch(invoke, context);
      expect(outcome.status).toBe("dispatched");
      expect(mintScripts).toEqual([]);
      expect(spawnedPtyCommand).toContain("--resume");
      expect(spawnedPtyCommand).toContain("stored-chat-7");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
