import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  DispatchAudit,
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
/** Keep MURRMURE_PROMPT in env only for small prompts — large values blow ARG_MAX / env limits. */
const MAX_ENV_PROMPT_CHARS = 32_000;
const PROMPT_PLACEHOLDER_RE = /"(\{\{prompt\}\})"|'(\{\{prompt\}\})'|\{\{prompt\}\}/g;

export interface ShellInvocation {
  command: string;
  cwd: string;
  /** When set, prompt is written to child stdin (not argv). */
  stdin_prompt?: string;
  prompt_path?: string;
}

export interface ShellStreamChunk {
  run_id?: string;
  step_id: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

export interface ShellCompleteInput {
  run_id?: string;
  step_id: string;
  action_name: string;
  outcome: DispatchOutcome;
}

export interface ShellSpawnDeps {
  spawn?: typeof spawn;
  onProcessStart?: (input: { run_id?: string; step_id: string; child: ReturnType<typeof spawn> }) => void;
  onOutputChunk?: (input: ShellStreamChunk) => void;
  onShellComplete?: (input: ShellCompleteInput) => void | Promise<void>;
}

/** Single-quoted string safe for /bin/sh -c. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export function stripPromptPlaceholder(command: string): string {
  return command.replace(PROMPT_PLACEHOLDER_RE, "").replace(/\s+/g, " ").trim();
}

function shouldDeliverPromptViaStdin(command: string, promptTemplate?: string): boolean {
  if (command.includes("{{prompt}}")) return true;
  return Boolean(promptTemplate?.trim());
}

function bareRunId(run_id: string | undefined): string | undefined {
  if (!run_id) return undefined;
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

function sanitizeStepId(step_id: string): string {
  return step_id.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function materializePromptArtifacts(input: {
  prompt: string;
  space_root: string;
  run_id?: string;
  step_id: string;
}): Promise<{ prompt_path?: string; env: Record<string, string> }> {
  const env: Record<string, string> = {};
  if (input.prompt.length <= MAX_ENV_PROMPT_CHARS) {
    env.MURRMURE_PROMPT = input.prompt;
  }

  const runBare = bareRunId(input.run_id);
  if (!runBare) return { env };

  const relDir = join(".mrmr", "dev", "runs", runBare);
  const fileName = `${sanitizeStepId(input.step_id)}-invoke-prompt.md`;
  const prompt_path = join(input.space_root, relDir, fileName);
  await mkdir(dirname(prompt_path), { recursive: true });
  await writeFile(prompt_path, input.prompt, "utf-8");
  env.MURRMURE_PROMPT_PATH = prompt_path;
  return { prompt_path, env };
}

function buildTemplateContext(invoke: InvokeRequest, context: DispatchContext) {
  return {
    action_name: invoke.action_name,
    space_id: invoke.space_id,
    run_id: invoke.run_id,
    session_id: invoke.session_id,
    space_root: context.space_root,
    params: invoke.params,
    murrmure_bindings: context.step_contract?.prompt_bindings,
    step_contract_path: context.step_contract?.contract_path,
    step_workdir: context.step_contract?.workdir,
  };
}

export function resolveShellInvocation(
  invoke: InvokeRequest,
  context: DispatchContext,
): ShellInvocation {
  const command = context.action.command;
  if (!command) {
    throw new Error(`Action '${context.action.name}' has no command for shell_spawn`);
  }

  const templateContext = buildTemplateContext(invoke, context);
  const bindings = buildInvokeTemplateBindings(templateContext);
  const resolvedPrompt = resolveInvokePrompt(templateContext, context.action.prompt);
  const viaStdin = shouldDeliverPromptViaStdin(command, context.action.prompt);

  let resolved = command.replace(/\{\{space_root\}\}/g, context.space_root ?? ".");
  if (viaStdin) {
    resolved = stripPromptPlaceholder(resolved);
  } else {
    resolved = resolved.replace(PROMPT_PLACEHOLDER_RE, () => shellQuote(resolvedPrompt));
    resolved = resolved.replace(/\{\{prompt\}\}/g, () => shellQuote(resolvedPrompt));
  }

  resolved = resolved.replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => {
    if (key === "prompt") {
      return viaStdin ? "" : shellQuote(resolvedPrompt);
    }
    const value = bindings[key];
    if (!value) return "";
    return shellQuote(value);
  });

  if (viaStdin) {
    resolved = resolved.replace(/\s+/g, " ").trim();
  }

  return {
    command: resolved,
    cwd: resolveCwd(context),
    stdin_prompt: viaStdin && resolvedPrompt.trim() ? resolvedPrompt : undefined,
  };
}

export function resolveShellCommand(invoke: InvokeRequest, context: DispatchContext): string {
  return resolveShellInvocation(invoke, context).command;
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
      murrmure_bindings: context.step_contract?.prompt_bindings,
      step_contract_path: context.step_contract?.contract_path,
      step_workdir: context.step_contract?.workdir,
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

export function resolveShellDispatchAudit(
  invoke: InvokeRequest,
  context: DispatchContext,
): DispatchAudit | undefined {
  if (!context.space_root) return undefined;
  return {
    command: resolveShellCommand(invoke, context),
    prompt: resolveShellPrompt(invoke, context),
    cwd: resolveCwd(context),
  };
}

function shouldDetachShell(context: DispatchContext): boolean {
  return Boolean(context.step_contract);
}

type ShellRunResult = { stdout: string; stderr: string; code: number | null };

function attachStreamListeners(
  child: ReturnType<typeof spawn>,
  input: {
    run_id?: string;
    step_id: string;
    onOutputChunk?: ShellSpawnDeps["onOutputChunk"];
  },
  buffers: { stdout: string; stderr: string },
): void {
  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    buffers.stdout += text;
    input.onOutputChunk?.({ run_id: input.run_id, step_id: input.step_id, stream: "stdout", chunk: text });
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    buffers.stderr += text;
    input.onOutputChunk?.({ run_id: input.run_id, step_id: input.step_id, stream: "stderr", chunk: text });
  });
}

function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  spawnFn: typeof spawn,
  extraEnv: Record<string, string>,
  onProcessStart?: ShellSpawnDeps["onProcessStart"],
  processMeta?: { run_id?: string; step_id: string },
  onOutputChunk?: ShellSpawnDeps["onOutputChunk"],
  stdinPrompt?: string,
): Promise<ShellRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(command, {
      cwd,
      shell: true,
      env: { ...process.env, ...extraEnv },
      stdio: stdinPrompt ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
    });

    onProcessStart?.({
      run_id: processMeta?.run_id,
      step_id: processMeta?.step_id ?? "unknown",
      child,
    });

    if (stdinPrompt && child.stdin) {
      child.stdin.write(stdinPrompt, "utf8");
      child.stdin.end();
    }

    const buffers = { stdout: "", stderr: "" };
    attachStreamListeners(child, { run_id: processMeta?.run_id, step_id: processMeta?.step_id ?? "unknown", onOutputChunk }, buffers);

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
      resolve({ stdout: buffers.stdout, stderr: buffers.stderr, code });
    });
  });
}

function runCommandDetached(
  command: string,
  cwd: string,
  spawnFn: typeof spawn,
  extraEnv: Record<string, string>,
  deps: Pick<ShellSpawnDeps, "onProcessStart" | "onOutputChunk" | "onShellComplete">,
  processMeta: { run_id?: string; step_id: string; action_name: string },
  stdinPrompt?: string,
): void {
  const child = spawnFn(command, {
    cwd,
    shell: true,
    env: { ...process.env, ...extraEnv },
    stdio: stdinPrompt ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });

  deps.onProcessStart?.({
    run_id: processMeta.run_id,
    step_id: processMeta.step_id,
    child,
  });

  if (stdinPrompt && child.stdin) {
    child.stdin.write(stdinPrompt, "utf8");
    child.stdin.end();
  }

  const buffers = { stdout: "", stderr: "" };
  attachStreamListeners(
    child,
    { run_id: processMeta.run_id, step_id: processMeta.step_id, onOutputChunk: deps.onOutputChunk },
    buffers,
  );

  const finish = (outcome: DispatchOutcome) => {
    void deps.onShellComplete?.({
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      action_name: processMeta.action_name,
      outcome,
    });
  };

  child.on("error", (err) => {
    finish({
      status: "failed",
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      error_code: "SHELL_SPAWN_FAILED",
      detail: err.message,
    });
  });

  child.on("close", (code) => {
    if (code !== 0) {
      finish({
        status: "failed",
        run_id: processMeta.run_id,
        step_id: processMeta.step_id,
        error_code: "SHELL_EXIT_NONZERO",
        detail: buffers.stderr || `Process exited with code ${code}`,
        result: { stdout: buffers.stdout, stderr: buffers.stderr, exit_code: code },
      });
      return;
    }

    const result = parseShellResult(buffers.stdout, false);
    if (result === "invalid") {
      finish({
        status: "failed",
        run_id: processMeta.run_id,
        step_id: processMeta.step_id,
        error_code: "RESPONSE_NOT_JSON",
        detail: "shell_spawn expects stdout JSON when response_schema is set",
      });
      return;
    }

    finish({
      status: "completed",
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      result: {
        ...result,
        stdout: buffers.stdout,
        stderr: buffers.stderr,
      },
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

function buildShellOutcome(
  input: {
    stdout: string;
    stderr: string;
    code: number | null;
    requiresJson: boolean;
    timeoutMs: number;
    run_id?: string;
    step_id: string;
  },
  error?: { code: string; detail: string },
): DispatchOutcome {
  if (error) {
    return {
      status: "failed",
      run_id: input.run_id,
      step_id: input.step_id,
      error_code: error.code,
      detail: error.detail,
    };
  }

  if (input.code !== 0) {
    return {
      status: "failed",
      run_id: input.run_id,
      step_id: input.step_id,
      error_code: "SHELL_EXIT_NONZERO",
      detail: input.stderr || `Process exited with code ${input.code}`,
      result: { stdout: input.stdout, stderr: input.stderr, exit_code: input.code },
    };
  }

  const result = parseShellResult(input.stdout, input.requiresJson);
  if (result === "invalid") {
    return {
      status: "failed",
      run_id: input.run_id,
      step_id: input.step_id,
      error_code: "RESPONSE_NOT_JSON",
      detail: "shell_spawn expects stdout JSON when response_schema is set",
    };
  }

  return {
    status: "completed",
    run_id: input.run_id,
    step_id: input.step_id,
    result: {
      ...result,
      stdout: input.stdout,
      stderr: input.stderr,
    },
  };
}

export function createShellSpawnExecutor(deps: ShellSpawnDeps = {}): ExecutorPort {
  const spawnFn = deps.spawn ?? spawn;
  const onProcessStart = deps.onProcessStart;

  return {
    async preflight(_binding, _context): Promise<ReachabilityResult> {
      return { status: "reachable" };
    },

    async resolveDispatchAudit(invoke, context) {
      return resolveShellDispatchAudit(invoke, context);
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
        const invocation = resolveShellInvocation(invoke, context);
        const prompt = resolveShellPrompt(invoke, context);

        const invokeEnv: Record<string, string> = {
          MURRMURE_ACTION: invoke.action_name,
          MURRMURE_SPACE_ID: invoke.space_id,
          MURRMURE_RUN_ID: invoke.run_id ?? "",
          MURRMURE_SESSION_ID: invoke.session_id ?? "",
          MURRMURE_STEP_ID: step_id,
          MURRMURE_INVOKE_PARAMS: JSON.stringify(invoke.params ?? {}),
          MURRMURE_INPUT: JSON.stringify(context.exec_input ?? invoke.exec_input ?? {}),
        };
        const promptArtifacts = await materializePromptArtifacts({
          prompt,
          space_root: context.space_root,
          run_id: invoke.run_id,
          step_id,
        });
        Object.assign(invokeEnv, promptArtifacts.env);
        if (context.step_contract) {
          invokeEnv.MURRMURE_STEP_CONTRACT = context.step_contract.slice_json;
          invokeEnv.MURRMURE_ACTIVE_STEP_CONTRACT_PATH = context.step_contract.contract_path;
          invokeEnv.MURRMURE_STEP_WORKDIR = context.step_contract.workdir;
          if (context.step_contract.hub_token) {
            invokeEnv.MURRMURE_HUB_TOKEN = context.step_contract.hub_token;
          }
          if (context.step_contract.hub_url) {
            invokeEnv.MURRMURE_HUB_URL = context.step_contract.hub_url;
          }
          if (context.step_contract.run_artifacts_json) {
            invokeEnv.MURRMURE_RUN_ARTIFACTS = context.step_contract.run_artifacts_json;
          }
        }

        if (shouldDetachShell(context)) {
          runCommandDetached(
            invocation.command,
            invocation.cwd,
            spawnFn,
            invokeEnv,
            deps,
            {
              run_id: invoke.run_id,
              step_id,
              action_name: invoke.action_name,
            },
            invocation.stdin_prompt,
          );
          return {
            status: "dispatched",
            run_id: invoke.run_id,
            step_id,
          };
        }

        const { stdout, stderr, code } = await runCommand(
          invocation.command,
          invocation.cwd,
          timeoutMs,
          spawnFn,
          invokeEnv,
          onProcessStart,
          { run_id: invoke.run_id, step_id },
          deps.onOutputChunk,
          invocation.stdin_prompt,
        );

        return buildShellOutcome(
          { stdout, stderr, code, requiresJson, timeoutMs, run_id: invoke.run_id, step_id },
        );
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
