import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn as spawnPty, type IPty } from "node-pty";
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
import {
  resolveSafeShellCommand,
  HandlerBindingError,
} from "./shell-command.js";
import {
  ArtifactMaterializationError,
  consumerInputPath,
  consumerInputsDirPath,
  isMeetingWakeParams,
  materializeConsumerCopy,
  materializeConsumerCopyDirectory,
  runScratchDir,
  type RunArtifactsBag,
} from "@murrmure/hub-core";

export { shellQuote } from "./shell-command.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const TERMINATION_GRACE_MS = 5_000;
const PERSISTENT_IDLE_MS = process.env.VITEST ? 0 : 1_500;
const PERSISTENT_SUBMIT_DELAY_MS = process.env.VITEST ? 0 : 80;
const PERSISTENT_BOOT_MS = process.env.VITEST ? 0 : 8_000;
/** Keep MURRMURE_PROMPT in env only for small prompts — large values blow ARG_MAX / env limits. */
const MAX_ENV_PROMPT_CHARS = 32_000;
const POSIX_SHELL = "/bin/sh";

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

export interface PersistentShellSessionController {
  close(reason?: string): Promise<void>;
  /** Queue one later turn. Flushed when the PTY is idle. */
  write(text: string): void;
}

export type PersistentPtySpawn = (
  file: string,
  args: string[],
  options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: Record<string, string>;
  },
) => IPty;

export interface ShellSpawnDeps {
  spawn?: typeof spawn;
  spawnPty?: PersistentPtySpawn;
  onProcessStart?: (input: { run_id?: string; step_id: string; child: ReturnType<typeof spawn> }) => (() => void) | void;
  onPersistentSessionStart?: (input: {
    run_id?: string;
    step_id: string;
    action_name: string;
    session_id: string;
    participant_id: string;
    pid: number;
    controller: PersistentShellSessionController;
  }) => (() => void) | void;
  onOutputChunk?: (input: ShellStreamChunk) => void;
  onShellComplete?: (input: ShellCompleteInput) => void | Promise<void>;
}

function shouldDeliverPromptViaStdin(command: string, promptTemplate?: string): boolean {
  if (command.includes("{{prompt}}")) return true;
  return Boolean(promptTemplate?.trim());
}

function sanitizeStepId(step_id: string): string {
  return step_id.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

type MeetingContinuationState = {
  protocol: "murrmure.meeting-continuation/v1";
  token: string;
  token_field: string;
  updated_at: string;
};

function continuationPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function meetingContinuationStatePath(input: {
  space_root: string;
  session_id: string;
  participant_id: string;
  action_name: string;
}): string {
  return join(
    input.space_root,
    ".mrmr",
    "dev",
    "meeting-seats",
    continuationPathSegment(input.session_id),
    continuationPathSegment(input.participant_id),
    `${continuationPathSegment(input.action_name)}.json`,
  );
}

function readTokenField(value: unknown, field: string): unknown {
  let current = value;
  for (const segment of field.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Extract one opaque continuation token from JSON or JSONL stdout. */
export function extractContinuationToken(stdout: string, tokenField: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const token = readTokenField(JSON.parse(trimmed), tokenField);
      if (typeof token === "string" && token.trim()) return token.trim();
    } catch {
      // Stream output may mix human-readable lines with JSON; ignore those.
    }
  }
  return undefined;
}

async function readMeetingContinuationToken(path: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<MeetingContinuationState>;
    return typeof parsed.token === "string" && parsed.token.trim()
      ? parsed.token.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

async function persistMeetingContinuationToken(input: {
  path: string;
  stdout: string;
  token_field: string;
}): Promise<void> {
  const token = extractContinuationToken(input.stdout, input.token_field);
  if (!token) return;
  await mkdir(dirname(input.path), { recursive: true });
  const state: MeetingContinuationState = {
    protocol: "murrmure.meeting-continuation/v1",
    token,
    token_field: input.token_field,
    updated_at: new Date().toISOString(),
  };
  await writeFile(input.path, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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

  if (!input.run_id) return { env };

  const runDir = runScratchDir(input.space_root, input.run_id);
  const fileName = `${sanitizeStepId(input.step_id)}-invoke-prompt.md`;
  const prompt_path = join(runDir, fileName);
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

const ARTIFACT_PATH_PLACEHOLDER_RE =
  /\{\{murrmure\.step\.([A-Za-z0-9._-]+)\.artifact\.([A-Za-z0-9._-]+)\.path\}\}/g;

const ARTIFACT_DIRECTORY_PLACEHOLDER_RE =
  /\{\{murrmure\.step\.([A-Za-z0-9._-]+)\.artifact\.([A-Za-z0-9._-]+)\.directory\}\}/g;

/**
 * Materialize verified local consumer copies for every artifact placeholder the
 * command references, and return the binding overrides the safe resolver uses.
 *
 * `{{murrmure.step.{p}.artifact.{slot}.path}}` resolves only for a singleton
 * slot to one absolute, digest-verified consumer copy. `{{murrmure.step.{p}.
 * artifact.{slot}.directory}}` resolves only for a collection slot to one
 * verified consumer input directory containing every file in the ordered
 * collection. A `.path` reference on a collection (or `.directory` on a
 * singleton) is returned as `null` so the resolver fails fast with a typed
 * missing-binding error before any process is spawned — singleton and
 * collection token shapes cannot be confused. A referenced producer/slot that
 * is absent from the run artifacts bag is likewise `null`.
 */
export async function materializeArtifactBindings(input: {
  command: string;
  runArtifacts: RunArtifactsBag;
  space_root: string;
  run_id?: string;
  consumer_step: string;
}): Promise<Record<string, string | null>> {
  const overrides: Record<string, string | null> = {};
  const pathRefs = new Set<string>();
  const dirRefs = new Set<string>();
  for (const match of input.command.matchAll(ARTIFACT_PATH_PLACEHOLDER_RE)) {
    pathRefs.add(`${match[1]}::${match[2]}`);
  }
  for (const match of input.command.matchAll(ARTIFACT_DIRECTORY_PLACEHOLDER_RE)) {
    dirRefs.add(`${match[1]}::${match[2]}`);
  }

  for (const ref of pathRefs) {
    const [producer, slot] = ref.split("::");
    const key = `murrmure.step.${producer}.artifact.${slot}.path`;
    const record = input.runArtifacts[producer]?.[slot];
    if (!record || !input.run_id || record.cardinality !== "singleton") {
      overrides[key] = null;
      continue;
    }
    const file = record.files[0];
    if (!file) {
      overrides[key] = null;
      continue;
    }
    // A relayed reference that was not materialized to a local consumer copy
    // carries no `path` (only `transfer_id` / `digest`). Binding it would feed
    // `undefined` into `path.join` and crash; instead emit a typed missing
    // binding so the resolver fails fast with `HANDLER_BINDING_VALUE_MISSING`
    // and the handler fetches the bytes via the relayed `hub_token` / `hub_url`.
    if (!file.path) {
      overrides[key] = null;
      continue;
    }
    const dest = consumerInputPath(input.space_root, input.run_id, input.consumer_step, slot, file.name);
    const source_path = join(input.space_root, file.path);
    // A relay-rebound `file.path` already points at the verified consumer copy
    // the destination invoke-service materialized; re-copying it onto itself is
    // redundant (and risks the all-or-nothing collection wipe). Bind it directly.
    if (source_path === dest) {
      overrides[key] = dest;
      continue;
    }
    const copy = await materializeConsumerCopy({
      space_root: input.space_root,
      run_id: input.run_id,
      consumer_step: input.consumer_step,
      slot,
      source_path,
      filename: file.name,
      expected_digest: file.digest,
    });
    overrides[key] = copy.path;
  }

  for (const ref of dirRefs) {
    const [producer, slot] = ref.split("::");
    const key = `murrmure.step.${producer}.artifact.${slot}.directory`;
    const record = input.runArtifacts[producer]?.[slot];
    if (!record || !input.run_id || record.cardinality !== "collection") {
      overrides[key] = null;
      continue;
    }
    // A collection slot is only bindable when every ordered file has a local
    // consumer copy; any unmaterialized (path-less) reference makes the
    // directory incomplete, so emit a typed missing binding rather than
    // producing a half-populated directory or crashing on `path.join`.
    if (record.files.some((file) => !file.path)) {
      overrides[key] = null;
      continue;
    }
    const runId = input.run_id;
    const dirDest = consumerInputsDirPath(
      input.space_root,
      runId,
      input.consumer_step,
      slot,
    );
    // Relay-rebound `file.path` values already point at verified consumer copies
    // inside this directory; if every file is already in place, bind the
    // directory directly instead of re-copying each file onto itself.
    if (
      record.files.every(
        (file) =>
          join(input.space_root, file.path) ===
          consumerInputPath(input.space_root, runId, input.consumer_step, slot, file.name),
      )
    ) {
      overrides[key] = dirDest;
      continue;
    }
    const dir = await materializeConsumerCopyDirectory({
      space_root: input.space_root,
      run_id: runId,
      consumer_step: input.consumer_step,
      slot,
      files: record.files.map((file) => ({
        source_path: join(input.space_root, file.path),
        filename: file.name,
        expected_digest: file.digest,
      })),
    });
    overrides[key] = dir.directory;
  }

  return overrides;
}

export function resolveShellInvocation(
  invoke: InvokeRequest,
  context: DispatchContext,
  artifactBindings?: Record<string, string | null>,
  options: {
    command?: string;
    continuation_token?: string;
    /** Persistent seats pass `{{prompt}}` as argv so interactive CLIs start a real first turn. */
    persistent?: boolean;
  } = {},
): ShellInvocation {
  const command = options.command ?? context.action.command;
  if (!command) {
    throw new Error(`Action '${context.action.name}' has no command for shell_spawn`);
  }

  const templateContext = buildTemplateContext(invoke, context);
  const bindings = {
    ...buildInvokeTemplateBindings(templateContext),
    continuation_token: options.continuation_token,
    ...(artifactBindings ?? {}),
  };
  const resolvedPrompt = resolveInvokePrompt(templateContext, context.action.prompt);
  const viaStdin =
    !options.persistent && shouldDeliverPromptViaStdin(command, context.action.prompt);

  const resolved = resolveSafeShellCommand(command, bindings, {
    stripPrompt: viaStdin,
    promptText: resolvedPrompt,
  }).script;

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
  const authoredCommand = context.action.command ?? "";
  const runArtifacts: RunArtifactsBag = context.step_contract?.run_artifacts_json
    ? (JSON.parse(context.step_contract.run_artifacts_json) as RunArtifactsBag)
    : {};
  // The audit is journaled and stored on the run; it must never carry a local
  // run-scratch path. Artifact `.path` placeholders resolve to opaque references
  // (transfer id when available, else a symbolic `artifact:{producer}:{slot}`)
  // instead of the producer's local path or the consumer copy path.
  const referenceBindings = buildArtifactReferenceBindings(authoredCommand, runArtifacts);
  let resolvedCommand: string;
  try {
    resolvedCommand = resolveShellInvocation(invoke, context, referenceBindings).command;
  } catch {
    // A binding/grammar error prevents resolution; the dispatch will fail with
    // a typed code before spawn. Record the authored command shape, which never
    // contains a runtime-resolved local path.
    resolvedCommand = authoredCommand;
  }
  return {
    command: resolvedCommand,
    prompt: resolveShellPrompt(invoke, context),
    cwd: resolveCwd(context),
  };
}

/**
 * Build binding overrides that resolve every artifact placeholder in `command`
 * to an opaque reference — never a local path. Used for the journaled dispatch
 * audit. A singleton `.path` resolves to its transfer id (or `artifact:{p}:
 * {slot}`); a collection `.directory` resolves to the symbolic `artifact:{p}:
 * {slot}:directory`. Journals and public APIs receive references, never local
 * run-scratch paths or consumer copy paths.
 */
export function buildArtifactReferenceBindings(
  command: string,
  runArtifacts: RunArtifactsBag,
): Record<string, string> {
  const bindings: Record<string, string> = {};
  const seen = new Set<string>();
  for (const match of command.matchAll(ARTIFACT_PATH_PLACEHOLDER_RE)) {
    const producer = match[1]!;
    const slot = match[2]!;
    const key = `${producer}::${slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const record = runArtifacts[producer]?.[slot];
    const reference = record?.files[0]?.transfer_id
      ? record.files[0].transfer_id
      : `artifact:${producer}:${slot}`;
    bindings[`murrmure.step.${producer}.artifact.${slot}.path`] = reference;
  }
  for (const match of command.matchAll(ARTIFACT_DIRECTORY_PLACEHOLDER_RE)) {
    const producer = match[1]!;
    const slot = match[2]!;
    const key = `${producer}::${slot}::directory`;
    if (seen.has(key)) continue;
    seen.add(key);
    bindings[`murrmure.step.${producer}.artifact.${slot}.directory`] =
      `artifact:${producer}:${slot}:directory`;
  }
  return bindings;
}

function shouldDetachShell(invoke: InvokeRequest, context: DispatchContext): boolean {
  // Meeting seats are long-lived assignments. Return as soon as the process
  // starts so the hub can register the live seat before the child emits said.
  return Boolean(context.step_contract) || isMeetingWakeParams(invoke.params);
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

function terminateProcessGroup(
  child: ReturnType<typeof spawn>,
  signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
): void {
  const pid = child.pid;
  if (typeof pid === "number") {
    try {
      process.kill(-pid, signal);
    } catch {
      // Process group may have already exited; fall back to direct signal.
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    }
    return;
  }
  try {
    child.kill(signal);
  } catch {
    /* already gone */
  }
}

function spawnShellScript(
  spawnFn: typeof spawn,
  script: string,
  cwd: string,
  extraEnv: Record<string, string>,
  stdinPrompt?: string,
): ReturnType<typeof spawn> {
  return spawnFn(POSIX_SHELL, ["-e", "-c", script], {
    cwd,
    shell: false,
    detached: true,
    env: { ...process.env, ...extraEnv },
    stdio: stdinPrompt ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
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
    const child = spawnShellScript(spawnFn, command, cwd, extraEnv, stdinPrompt);

    const onProcessStartCleanup = onProcessStart?.({
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

    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let terminating = false;
    const clearTimers = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };

    const timer = setTimeout(() => {
      terminating = true;
      terminateProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), TERMINATION_GRACE_MS);
      reject(new Error("SHELL_TIMEOUT"));
    }, timeoutMs);

    child.on("error", (err) => {
      if (!terminating) clearTimers();
      onProcessStartCleanup?.();
      reject(err);
    });

    child.on("close", (code) => {
      // When termination was initiated, keep the SIGKILL escalation armed so a
      // TERM-resistant descendant in the process group is reaped after the
      // grace period; only clear it on a natural exit.
      if (!terminating) clearTimers();
      // Deregister the cancel handle now that the process has settled, so a
      // later run-failure/external-resolve cancel cannot re-terminate the same
      // tree (once-only termination).
      onProcessStartCleanup?.();
      resolve({ stdout: buffers.stdout, stderr: buffers.stderr, code });
    });
  });
}

function runCommandDetached(
  command: string,
  cwd: string,
  timeoutMs: number,
  spawnFn: typeof spawn,
  extraEnv: Record<string, string>,
  deps: Pick<ShellSpawnDeps, "onProcessStart" | "onOutputChunk" | "onShellComplete">,
  processMeta: { run_id?: string; step_id: string; action_name: string },
  stdinPrompt?: string,
): void {
  const child = spawnShellScript(spawnFn, command, cwd, extraEnv, stdinPrompt);
  child.unref?.();

  const onProcessStartCleanup = deps.onProcessStart?.({
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

  let settled = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let terminating = false;
  const clearKillTimer = () => {
    if (killTimer) {
      clearTimeout(killTimer);
      killTimer = undefined;
    }
  };
  const finish = (outcome: DispatchOutcome) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    // Deregister the cancel handle the moment the process settles (timeout,
    // error, or close) so a subsequent run-failure/external-resolve cancel
    // cannot re-terminate the same tree — the local SIGKILL escalation stays
    // armed to reap any TERM-resistant descendant. This makes integrated
    // timeout/cancel termination once-only.
    onProcessStartCleanup?.();
    void deps.onShellComplete?.({
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      action_name: processMeta.action_name,
      outcome,
    });
  };

  const timer = setTimeout(() => {
    terminating = true;
    terminateProcessGroup(child, "SIGTERM");
    killTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), TERMINATION_GRACE_MS);
    finish({
      status: "failed",
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      error_code: "ACTION_TIMED_OUT",
      detail: `Command timed out after ${timeoutMs}ms`,
    });
  }, timeoutMs);

  child.on("error", (err) => {
    if (!terminating) clearKillTimer();
    finish({
      status: "failed",
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      error_code: "SHELL_SPAWN_FAILED",
      detail: err.message,
    });
  });

  child.on("close", (code) => {
    // When termination was initiated (timeout/cancel), keep the SIGKILL
    // escalation armed so a TERM-resistant descendant in the process group is
    // reaped after the grace period. Only clear it on a natural exit.
    if (!terminating) clearKillTimer();
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

const PERSISTENT_OUTPUT_TAIL_CHARS = 12_000;
const PERSISTENT_INLINE_TURN_CHARS = 240;

function persistLiveTurnFile(session_id: string, text: string): string | null {
  if (!text.includes("\n") && text.length <= PERSISTENT_INLINE_TURN_CHARS) return null;
  const safeSession = session_id.replace(/[^A-Za-z0-9_-]/g, "_");
  const dir = join(tmpdir(), "murrmure-live-turns", safeSession);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `turn-${Date.now()}.md`);
  writeFileSync(path, text, "utf8");
  return path;
}

function ptyEnvironment(extraEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null) env[key] = value;
  }
  return { ...env, ...extraEnv };
}

function terminatePtyProcessGroup(
  pty: IPty,
  signal: "SIGTERM" | "SIGKILL",
): void {
  try {
    process.kill(-pty.pid, signal);
    return;
  } catch {
    // The PTY host may not expose a separate process group on every platform.
  }
  try {
    pty.kill(signal);
  } catch {
    /* already gone */
  }
}

/**
 * Keep one interactive terminal alive for the assignment.
 * First turn is the command argv (`{{prompt}}`). Later turns are written to
 * the PTY after the process goes idle, then submitted with Enter.
 */
function runPersistentCommand(
  command: string,
  cwd: string,
  extraEnv: Record<string, string>,
  spawnPtyFn: PersistentPtySpawn,
  deps: Pick<ShellSpawnDeps, "onPersistentSessionStart" | "onShellComplete" | "onOutputChunk">,
  processMeta: {
    run_id?: string;
    step_id: string;
    action_name: string;
    session_id: string;
    participant_id: string;
    shutdown_grace_ms: number;
  },
): void {
  const pty = spawnPtyFn(POSIX_SHELL, ["-e", "-c", command], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd,
    env: ptyEnvironment(extraEnv),
  });

  let settled = false;
  let closeRequested = false;
  let closeReason = "assignment_closed";
  let outputTail = "";
  let turnBusy = true;
  const turnQueue: string[] = [];
  let gracefulTimer: ReturnType<typeof setTimeout> | undefined;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let submitTimer: ReturnType<typeof setTimeout> | undefined;
  let bootTimer: ReturnType<typeof setTimeout> | undefined;
  let unregister: (() => void) | void;
  let resolveExit!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });

  const clearTimers = () => {
    if (gracefulTimer) clearTimeout(gracefulTimer);
    if (killTimer) clearTimeout(killTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (submitTimer) clearTimeout(submitTimer);
    if (bootTimer) clearTimeout(bootTimer);
  };

  const submitTurn = (text: string) => {
    const body = text.replace(/\s+$/g, "");
    if (!body) return;
    const turnPath = persistLiveTurnFile(processMeta.session_id, body);
    const submitted = turnPath
      ? `New meeting message. Read ${turnPath} and follow those instructions now.`
      : body;
    turnBusy = true;
    try {
      pty.write(submitted);
    } catch {
      return;
    }
    const sendEnter = () => {
      if (settled || closeRequested) return;
      try {
        pty.write("\r");
      } catch {
        /* process may already be exiting */
      }
    };
    if (PERSISTENT_SUBMIT_DELAY_MS === 0) {
      sendEnter();
      return;
    }
    submitTimer = setTimeout(sendEnter, PERSISTENT_SUBMIT_DELAY_MS);
  };

  const flushNextTurn = () => {
    if (settled || closeRequested || turnBusy || turnQueue.length === 0) return;
    const next = turnQueue.shift();
    if (next) submitTurn(next);
  };

  const markIdle = () => {
    turnBusy = false;
    flushNextTurn();
  };

  const scheduleIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(markIdle, PERSISTENT_IDLE_MS);
  };

  const controller: PersistentShellSessionController = {
    write(text) {
      if (settled || closeRequested) return;
      const body = text.trim();
      if (!body) return;
      turnQueue.push(body);
      if (!turnBusy) flushNextTurn();
    },
    async close(reason) {
      if (settled) return;
      if (!closeRequested) {
        closeRequested = true;
        closeReason = reason?.trim() || closeReason;
        try {
          // Ctrl-D asks an idle interactive CLI to exit without starting a new
          // turn. Escalate only if the harness does not honor it.
          pty.write("\x04");
        } catch {
          /* process may already be exiting */
        }
        gracefulTimer = setTimeout(() => {
          terminatePtyProcessGroup(pty, "SIGTERM");
          killTimer = setTimeout(
            () => terminatePtyProcessGroup(pty, "SIGKILL"),
            TERMINATION_GRACE_MS,
          );
        }, processMeta.shutdown_grace_ms);
      }
      await exited;
    },
  };

  pty.onData((chunk) => {
    outputTail = `${outputTail}${chunk}`.slice(-PERSISTENT_OUTPUT_TAIL_CHARS);
    deps.onOutputChunk?.({
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      stream: "stdout",
      chunk,
    });
    turnBusy = true;
    scheduleIdle();
  });

  pty.onExit(({ exitCode, signal }) => {
    if (settled) return;
    settled = true;
    clearTimers();
    unregister?.();
    resolveExit();
    const outcome: DispatchOutcome = closeRequested
      ? {
          status: "completed",
          run_id: processMeta.run_id,
          step_id: processMeta.step_id,
          result: { persistent_session: true, close_reason: closeReason },
        }
      : {
          status: "failed",
          run_id: processMeta.run_id,
          step_id: processMeta.step_id,
          error_code: "PERSISTENT_SESSION_EXITED",
          detail: `Persistent shell session exited before assignment close (code ${exitCode}, signal ${signal})`,
          result: { persistent_session: true, output_tail: outputTail, exit_code: exitCode, signal },
        };
    void deps.onShellComplete?.({
      run_id: processMeta.run_id,
      step_id: processMeta.step_id,
      action_name: processMeta.action_name,
      outcome,
    });
  });

  unregister = deps.onPersistentSessionStart?.({
    run_id: processMeta.run_id,
    step_id: processMeta.step_id,
    action_name: processMeta.action_name,
    session_id: processMeta.session_id,
    participant_id: processMeta.participant_id,
    pid: pty.pid,
    controller,
  });

  bootTimer = setTimeout(markIdle, PERSISTENT_BOOT_MS);
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
  const spawnPtyFn = deps.spawnPty ?? spawnPty;
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
        const command = context.action.command;
        if (!command) {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: "SHELL_SPAWN_FAILED",
            detail: `Action '${context.action.name}' has no command for shell_spawn`,
          };
        }

        const runArtifacts: RunArtifactsBag = context.step_contract?.run_artifacts_json
          ? (JSON.parse(context.step_contract.run_artifacts_json) as RunArtifactsBag)
          : {};
        const artifactBindings = await materializeArtifactBindings({
          command,
          runArtifacts,
          space_root: context.space_root,
          run_id: invoke.run_id,
          consumer_step: step_id,
        });
        const meetingWake = isMeetingWakeParams(invoke.params) ? invoke.params : undefined;
        const meetingContinuation =
          meetingWake && context.action.continuation
            ? {
                path: meetingContinuationStatePath({
                  space_root: context.space_root,
                  session_id: meetingWake.session_id,
                  participant_id: meetingWake.participant_id,
                  action_name: invoke.action_name,
                }),
                config: context.action.continuation,
              }
            : undefined;
        const continuationToken = meetingContinuation
          ? await readMeetingContinuationToken(meetingContinuation.path)
          : undefined;
        const invocation = resolveShellInvocation(invoke, context, artifactBindings, {
          command: continuationToken
            ? meetingContinuation?.config.command
            : context.action.command,
          continuation_token: continuationToken,
          persistent: context.action.session?.mode === "persistent",
        });
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
        if (meetingWake) {
          // Meeting shells use the space connection, not a step-scoped resolve
          // credential. These ids let the child bridge bind its exact `ptc_*`
          // instead of guessing by persona or connection order.
          invokeEnv.MURRMURE_MEETING_SESSION_ID = meetingWake.session_id;
          invokeEnv.MURRMURE_MEETING_PARTICIPANT_ID = meetingWake.participant_id;
        } else {
          invokeEnv.MURRMURE_ASSIGNMENT_SCOPE =
            `${invoke.run_id ?? ""}:${step_id}:${invoke.action_name}`;
        }
        if (continuationToken) {
          invokeEnv.MURRMURE_CONTINUATION_TOKEN = continuationToken;
        }
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

        if (context.action.session?.mode === "persistent") {
          if (!meetingWake) {
            return {
              status: "failed",
              run_id: invoke.run_id,
              step_id,
              error_code: "PERSISTENT_SESSION_IDENTITY_MISSING",
              detail: "persistent shell_spawn currently requires a meeting session and participant",
            };
          }
          runPersistentCommand(
            invocation.command,
            invocation.cwd,
            invokeEnv,
            spawnPtyFn,
            deps,
            {
              run_id: invoke.run_id,
              step_id,
              action_name: invoke.action_name,
              session_id: meetingWake.session_id,
              participant_id: meetingWake.participant_id,
              shutdown_grace_ms: context.action.session.shutdown_grace_ms,
            },
          );
          return {
            status: "dispatched",
            run_id: invoke.run_id,
            step_id,
          };
        }

        if (shouldDetachShell(invoke, context)) {
          const detachedDeps = meetingContinuation
            ? {
                ...deps,
                onShellComplete: async (input: ShellCompleteInput) => {
                  const stdout =
                    input.outcome.result &&
                    typeof input.outcome.result.stdout === "string"
                      ? input.outcome.result.stdout
                      : "";
                  await persistMeetingContinuationToken({
                    path: meetingContinuation.path,
                    stdout,
                    token_field: meetingContinuation.config.token_field,
                  });
                  await deps.onShellComplete?.(input);
                },
              }
            : deps;
          runCommandDetached(
            invocation.command,
            invocation.cwd,
            timeoutMs,
            spawnFn,
            invokeEnv,
            detachedDeps,
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
        if (error instanceof HandlerBindingError) {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: error.code,
            detail: error.message,
          };
        }
        if (error instanceof ArtifactMaterializationError) {
          return {
            status: "failed",
            run_id: invoke.run_id,
            step_id,
            error_code: error.code,
            detail: error.message,
          };
        }
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
