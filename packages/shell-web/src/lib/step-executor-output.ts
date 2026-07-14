import type { JournalEntryItem, RunDetailPayload } from "@murrmure/shell-client";
import { formatDateTime } from "./format-display.js";
import {
  coalesceAssistantStream,
  compactToolCallStream,
  parseAgentStreamValue,
  type AgentStreamEvent,
} from "./parse-agent-stream.js";
import { tryParseJsonString } from "./parse-display-value.js";

const ACTION_EVENT_TYPES = new Set([
  "mrmr.action.dispatched",
  "mrmr.action.completed",
  "mrmr.action.failed",
  "mrmr.action.timed_out",
  "mrmr.action.executor_unavailable",
  "mrmr.step.opened",
  "mrmr.step.resolved",
]);

type StepExecRecord = {
  status?: string;
  output?: Record<string, unknown>;
  completed_at?: string;
  dispatch?: {
    command: string;
    prompt: string;
    cwd: string;
    dispatched_at?: string;
  };
};

function findDispatchAudit(
  exec: StepExecRecord | undefined,
  journalEntries: JournalEntryItem[] | undefined,
  runId: string,
  stepId: string,
): StepExecRecord["dispatch"] | undefined {
  if (exec?.dispatch) return exec.dispatch;

  const dispatched = filterStepJournalEntries(runId, stepId, journalEntries).find(
    (entry) => entry.type === "mrmr.action.dispatched",
  );
  if (!dispatched) return undefined;

  const command = dispatched.data.command;
  const prompt = dispatched.data.prompt;
  const cwd = dispatched.data.cwd;
  if (typeof command !== "string" || typeof prompt !== "string" || typeof cwd !== "string") {
    return undefined;
  }
  return { command, prompt, cwd };
}

type StepMemo = {
  step_id: string;
  status: string;
  error_code?: string;
  started_at?: string;
  completed_at?: string;
};

function stepExecContext(run: RunDetailPayload): Record<string, StepExecRecord> {
  const raw = run.exec_context?.steps;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, StepExecRecord>;
}

export function listInspectableStepIds(run: RunDetailPayload, graphStepIds?: string[]): string[] {
  const fromGraph = graphStepIds ?? [];
  const fromMemos = (run.steps ?? []).map((s) => s.step_id);
  const fromExec = Object.keys(stepExecContext(run));
  return [...new Set([...fromGraph, ...fromMemos, ...fromExec])];
}

export function pickDefaultStepId(run: RunDetailPayload, graphStepIds?: string[]): string | undefined {
  const ids = listInspectableStepIds(run, graphStepIds);
  if (ids.length === 0) return undefined;

  const memos = (run.steps ?? []) as StepMemo[];
  const working = memos.find((m) => m.status === "working");
  if (working) return working.step_id;

  const failed = memos.find((m) => m.status === "failed");
  if (failed) return failed.step_id;

  const exec = stepExecContext(run);
  const withOutput = ids.filter((id) => exec[id]?.output);
  if (withOutput.length > 0) return withOutput[withOutput.length - 1];

  return ids[ids.length - 1];
}

export function filterStepJournalEntries(
  runId: string,
  stepId: string,
  entries: JournalEntryItem[] | undefined,
): JournalEntryItem[] {
  if (!entries?.length) return [];
  return entries
    .filter((entry) => {
      if (entry.run_id && entry.run_id !== runId) return false;
      if (!ACTION_EVENT_TYPES.has(entry.type)) return false;
      const dataStep = entry.data?.step_id;
      return typeof dataStep !== "string" || dataStep === stepId;
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

export type ExecutorOutputSection =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "data"; label: string; value: unknown }
  | { kind: "agent_stdout"; events: AgentStreamEvent[]; live?: boolean };

function journalEventPayload(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "step_id" || key === "action_name") continue;
    if (value === undefined || value === null || value === "") continue;
    payload[key] = value;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function parseStreamOutput(text: string): unknown {
  const trimmed = text.trim();
  const asJson = tryParseJsonString(trimmed);
  if (asJson !== undefined) return asJson;

  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const parsedLines: unknown[] = [];
    let allJson = true;
    for (const line of lines) {
      const parsed = tryParseJsonString(line);
      if (parsed === undefined) {
        allJson = false;
        break;
      }
      parsedLines.push(parsed);
    }
    if (allJson && parsedLines.length > 0) return parsedLines;
  }

  return trimmed;
}

function outputRecordWithoutStreams(output: Record<string, unknown>): Record<string, unknown> | undefined {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (key === "stdout" || key === "stderr") continue;
    if (value === undefined || value === null || value === "") continue;
    rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function agentStreamFromStdout(stdout: string, live?: boolean): ExecutorOutputSection | undefined {
  const events = compactToolCallStream(
    coalesceAssistantStream(parseAgentStreamValue(parseStreamOutput(stdout)) ?? []),
  );
  if (events.length === 0) return undefined;
  return { kind: "agent_stdout", events, live };
}

export function buildStepExecutorOutputSections(
  run: RunDetailPayload,
  stepId: string,
  journalEntries?: JournalEntryItem[],
): ExecutorOutputSection[] {
  const sections: ExecutorOutputSection[] = [];
  const memo = (run.steps ?? []).find((s) => s.step_id === stepId) as StepMemo | undefined;
  const exec = stepExecContext(run)[stepId];

  const meta: Record<string, unknown> = {
    step: stepId,
    status: memo?.status ?? "unknown",
  };
  if (memo?.error_code) meta.error_code = memo.error_code;
  if (memo?.started_at) meta.started = formatDateTime(memo.started_at);
  if (memo?.completed_at) meta.completed = formatDateTime(memo.completed_at);
  sections.push({ kind: "data", label: "step", value: meta });

  const dispatchAudit = findDispatchAudit(exec, journalEntries, run.run_id, stepId);
  if (dispatchAudit) {
    sections.push({ kind: "heading", text: "Dispatch" });
    sections.push({
      kind: "data",
      label: "dispatch",
      value: {
        cwd: dispatchAudit.cwd,
        ...(dispatchAudit.dispatched_at
          ? { dispatched: formatDateTime(dispatchAudit.dispatched_at) }
          : {}),
        command: dispatchAudit.command,
        prompt: dispatchAudit.prompt,
      },
    });
  }

  const events = filterStepJournalEntries(run.run_id, stepId, journalEntries);
  if (events.length > 0) {
    sections.push({ kind: "heading", text: "Journal" });
    for (const entry of events) {
      const payload = journalEventPayload(entry.data);
      sections.push({
        kind: "data",
        label: `${formatDateTime(entry.time)} · ${entry.type.replace(/^mrmr\./, "")}`,
        value: {
          ...(entry.data.action_name ? { action: entry.data.action_name } : {}),
          ...(entry.data.step_id ? { step_id: entry.data.step_id } : {}),
          ...(payload ?? {}),
        },
      });
    }
  }

  sections.push({ kind: "heading", text: "Shell output" });
  if (exec?.output) {
    const stdout = exec.output.stdout;
    const stderr = exec.output.stderr;
    const streaming = exec.output.streaming === true;
    if (streaming && memo?.status === "working") {
      sections.push({
        kind: "text",
        text: "(live stream — updates while executor runs)",
      });
    }
    if (typeof stdout === "string" && stdout.trim()) {
      const agentSection = agentStreamFromStdout(stdout, streaming && memo?.status === "working");
      if (agentSection) {
        sections.push(agentSection);
      } else {
        sections.push({ kind: "data", label: "stdout", value: parseStreamOutput(stdout) });
      }
    }
    if (typeof stderr === "string" && stderr.trim()) {
      sections.push({ kind: "data", label: "stderr", value: parseStreamOutput(stderr.trim()) });
    }
    const outputMeta = outputRecordWithoutStreams(exec.output);
    if (outputMeta) {
      sections.push({ kind: "data", label: "output meta", value: outputMeta });
    }
    const hasStreamText =
      (typeof stdout === "string" && stdout.trim()) || (typeof stderr === "string" && stderr.trim());
    if (!hasStreamText && !streaming) {
      if (memo?.status === "completed" && exec.output && !stdout) {
        sections.push({
          kind: "text",
          text: "(step resolved via MCP — shell stdout pending or empty)",
        });
      }
      if (!outputMeta) {
        sections.push({ kind: "data", label: "output", value: exec.output });
      }
    }
  } else if (memo?.status === "working") {
    sections.push({
      kind: "text",
      text: "(executor running — output appears when the action completes)",
    });
  } else {
    sections.push({
      kind: "text",
      text: "(no executor output recorded for this step yet)",
    });
  }

  return sections;
}

export function formatStepExecutorOutput(
  run: RunDetailPayload,
  stepId: string,
  journalEntries?: JournalEntryItem[],
): string {
  return buildStepExecutorOutputSections(run, stepId, journalEntries)
    .map((section) => {
      if (section.kind === "heading") return `--- ${section.text.toLowerCase()} ---`;
      if (section.kind === "text") return section.text;
      return `${section.label}: [structured data]`;
    })
    .join("\n\n");
}
