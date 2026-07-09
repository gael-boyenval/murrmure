import type { StudioPersistencePort } from "@murrmure/hub-persistence";

export interface StepOutputRecord {
  status?: "completed" | "failed";
  output?: Record<string, unknown>;
  completed_at?: string;
  dispatch?: {
    command: string;
    prompt: string;
    cwd: string;
    dispatched_at: string;
  };
}

const MAX_STREAM_CHARS = 256_000;

function appendStreamText(current: string | undefined, chunk: string): string {
  const next = `${current ?? ""}${chunk}`;
  if (next.length <= MAX_STREAM_CHARS) return next;
  const trimmed = next.slice(-MAX_STREAM_CHARS);
  return `[…truncated…]\n${trimmed}`;
}

export function mergeStepOutputIntoExecContext(
  execContext: Record<string, unknown>,
  step_id: string,
  input: { status: "completed" | "failed"; output?: Record<string, unknown>; completed_at: string },
): Record<string, unknown> {
  const steps = {
    ...((execContext.steps ?? {}) as Record<string, StepOutputRecord>),
  };
  steps[step_id] = {
    ...steps[step_id],
    status: input.status,
    output: {
      ...((steps[step_id]?.output ?? {}) as Record<string, unknown>),
      ...(input.output ?? {}),
    },
    completed_at: input.completed_at,
  };
  return { ...execContext, steps };
}

export async function mergeDispatchAuditIntoRun(
  studio: StudioPersistencePort,
  input: {
    run_id: string;
    step_id: string;
    audit: { command: string; prompt: string; cwd: string };
    dispatched_at: string;
  },
): Promise<void> {
  const bare = bareRunId(input.run_id);
  const run = await studio.getRun(bare);
  if (!run) return;
  const steps = {
    ...((run.exec_context.steps ?? {}) as Record<string, StepOutputRecord>),
  };
  steps[input.step_id] = {
    ...steps[input.step_id],
    dispatch: {
      command: input.audit.command,
      prompt: input.audit.prompt,
      cwd: input.audit.cwd,
      dispatched_at: input.dispatched_at,
    },
  };
  await persistRunExecContext(studio, input.run_id, { ...run.exec_context, steps });
}

export function mergeCheckpointOutputIntoInput(
  execContext: Record<string, unknown>,
  output: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!output || Object.keys(output).length === 0) return execContext;
  const input = { ...((execContext.input ?? {}) as Record<string, unknown>) };
  return { ...execContext, input: { ...input, ...output } };
}

export function shouldMergeCheckpointInput(stepIndex: number, mergeInput?: boolean): boolean {
  if (mergeInput === false) return false;
  if (mergeInput === true) return true;
  return stepIndex === 0;
}

function bareRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id.slice(4) : run_id;
}

export async function persistRunExecContext(
  studio: StudioPersistencePort,
  run_id: string,
  execContext: Record<string, unknown>,
): Promise<void> {
  const bare = bareRunId(run_id);
  const run = await studio.getRun(bare);
  if (!run?.flow_id || !run.flow_digest) return;
  await studio.updateRunFlowBinding(bare, {
    flow_id: run.flow_id,
    flow_digest: run.flow_digest,
    exec_context: execContext,
  });
}

/** Append live shell stdout/stderr while a detached executor runs. */
export async function appendShellStreamToRun(
  studio: StudioPersistencePort,
  input: {
    run_id: string;
    step_id: string;
    stream: "stdout" | "stderr";
    chunk: string;
  },
): Promise<void> {
  if (!input.chunk) return;
  const bare = bareRunId(input.run_id);
  const run = await studio.getRun(bare);
  if (!run) return;
  const steps = {
    ...((run.exec_context.steps ?? {}) as Record<string, StepOutputRecord>),
  };
  const prior = steps[input.step_id]?.output ?? {};
  const field = input.stream;
  steps[input.step_id] = {
    ...steps[input.step_id],
    output: {
      ...prior,
      [field]: appendStreamText(typeof prior[field] === "string" ? prior[field] : undefined, input.chunk),
      streaming: true,
    },
  };
  await persistRunExecContext(studio, input.run_id, { ...run.exec_context, steps });
}

export async function mergeActionResultIntoRun(
  studio: StudioPersistencePort,
  input: {
    run_id: string;
    step_id: string;
    status: "completed" | "failed";
    result?: Record<string, unknown>;
    completed_at: string;
  },
): Promise<void> {
  const bare = bareRunId(input.run_id);
  const run = await studio.getRun(bare);
  if (!run) return;
  const next = mergeStepOutputIntoExecContext(run.exec_context, input.step_id, {
    status: input.status,
    output: {
      ...(input.result ?? {}),
      streaming: false,
    },
    completed_at: input.completed_at,
  });
  await persistRunExecContext(studio, input.run_id, next);
}
