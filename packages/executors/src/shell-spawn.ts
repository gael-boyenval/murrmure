import { spawn } from "node:child_process";
import type {
  DispatchContext,
  DispatchOutcome,
  ExecutorPort,
  InvokeRequest,
  ReachabilityResult,
} from "@murrmure/runtime-contracts";
import {
  buildInvokeTemplateBindings,
  resolveInvokePrompt,
} from "./invoke-shell-prompt.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ShellSpawnDeps {
  spawn?: typeof spawn;
  onProcessStart?: (input: { run_id?: string; step_id: string; child: ReturnType<typeof spawn> }) => void;
}

/** Single-quoted string safe for /bin/sh -c. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function resolveShellCommand(invoke: InvokeRequest, context: DispatchContext): string {
  const command = context.action.command;
  if (!command) {
    throw new Error(`Action '${context.action.name}' has no command for shell_spawn`);
  }

  const templateContext = {
    action_name: invoke.action_name,
    space_id: invoke.space_id,
    run_id: invoke.run_id,
    session_id: invoke.session_id,
    space_root: context.space_root,
    params: invoke.params,
  };

  const bindings = buildInvokeTemplateBindings(templateContext);
  const resolvedPrompt = resolveInvokePrompt(templateContext, context.action.prompt);

  let resolved = command.replace(/\{\{space_root\}\}/g, context.space_root ?? ".");
  resolved = resolved.replace(/\{\{prompt\}\}/g, () => shellQuote(resolvedPrompt));
  resolved = resolved.replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => {
    if (key === "prompt") return shellQuote(resolvedPrompt);
    const value = bindings[key];
    if (!value) return "";
    return shellQuote(value);
  });

  return resolved;
}

export function resolveShellPrompt(
  invoke: InvokeRequest,
  context: DispatchContext,
): string {
  return resolveInvokePrompt(
    {
      action_name: invoke.action_name,
      space_id: invoke.space_id,
      run_id: invoke.run_id,
      session_id: invoke.session_id,
      space_root: context.space_root,
      params: invoke.params,
    },
    context.action.prompt,
  );
}

function resolveCwd(context: DispatchContext): string {
  const cwd = context.action.cwd?.replace(/\{\{space_root\}\}/g, context.space_root ?? ".");
  if (cwd) return cwd;
  if (context.space_root) return context.space_root;
  return process.cwd();
}

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  spawnFn: typeof spawn,
  extraEnv: Record<string, string>,
  onProcessStart?: ShellSpawnDeps["onProcessStart"],
  processMeta?: { run_id?: string; step_id: string },
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...extraEnv },
    });

    onProcessStart?.({
      run_id: processMeta?.run_id,
      step_id: processMeta?.step_id ?? "unknown",
      child,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("SHELL_TIMEOUT"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

function parseShellResult(
  stdout: string,
  requiresJson: boolean,
): Record<string, unknown> | "invalid" {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return requiresJson ? "invalid" : { ok: true };
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return requiresJson ? "invalid" : { ok: true, stdout: trimmed };
  }
}

export function createShellSpawnExecutor(deps: ShellSpawnDeps = {}): ExecutorPort {
  const spawnFn = deps.spawn ?? spawn;
  const onProcessStart = deps.onProcessStart;

  return {
    async preflight(_binding, _context): Promise<ReachabilityResult> {
      return { status: "reachable" };
    },

    async dispatch(invoke: InvokeRequest, context: DispatchContext): Promise<DispatchOutcome> {
      const step_id = invoke.step_id ?? `action:${invoke.action_name}`;
      const timeoutMs = context.action.timeout_ms ?? DEFAULT_TIMEOUT_MS;
      const requiresJson = Boolean(context.action.response_schema);

      if (!context.space_root) {
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "SPACE_ROOT_MISSING",
          detail: "shell_spawn requires a linked space root path",
        };
      }

      try {
        const command = resolveShellCommand(invoke, context);
        const cwd = resolveCwd(context);
        const prompt = resolveShellPrompt(invoke, context);

        const invokeEnv: Record<string, string> = {
          MURRMURE_ACTION: invoke.action_name,
          MURRMURE_SPACE_ID: invoke.space_id,
          MURRMURE_RUN_ID: invoke.run_id ?? "",
          MURRMURE_SESSION_ID: invoke.session_id ?? "",
          MURRMURE_STEP_ID: step_id,
          MURRMURE_INVOKE_PARAMS: JSON.stringify(invoke.params ?? {}),
          MURRMURE_INPUT: JSON.stringify(context.exec_input ?? invoke.exec_input ?? {}),
          MURRMURE_PROMPT: prompt,
        };

        const { stdout, stderr, code } = await runCommand(
          command,
          cwd,
          timeoutMs,
          spawnFn,
          invokeEnv,
          onProcessStart,
          { run_id: invoke.run_id, step_id },
        );
        if (code !== 0) {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: "SHELL_EXIT_NONZERO",
            detail: stderr || `Process exited with code ${code}`,
          };
        }

        const result = parseShellResult(stdout, requiresJson);
        if (result === "invalid") {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: "RESPONSE_NOT_JSON",
            detail: "shell_spawn expects stdout JSON when response_schema is set",
          };
        }

        return {
          status: "completed",
          run_id: invoke.run_id,
          step_id,
          result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "SHELL_TIMEOUT") {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: "ACTION_TIMED_OUT",
            detail: `Command timed out after ${timeoutMs}ms`,
          };
        }
        return {
          status: "failed",
          run_id: invoke.run_id,
          step_id,
          error_code: "SHELL_SPAWN_FAILED",
          detail: message,
        };
      }
    },
  };
}
