import type { JournalEntryItem, RunDetailPayload } from "@murrmure/shell-client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge, cn } from "@murrmure/shell-ui";
import {
  buildStepExecutorOutputSections,
  listInspectableStepIds,
} from "../lib/step-executor-output.js";
import { AgentStreamView } from "./AgentStreamView.js";
import { DataTableView } from "./DataTableView.js";
import { DEFAULT_TRUNCATE_LEN } from "../lib/parse-display-value.js";

function shortStepLabel(stepId: string): string {
  const dot = stepId.lastIndexOf(".");
  return dot >= 0 ? stepId.slice(dot + 1) : stepId;
}

const statusTone: Record<string, string> = {
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  working: "bg-amber-400 animate-pulse",
  awaiting_human: "bg-sky-400",
  pending: "bg-zinc-500",
  skipped: "bg-zinc-600",
};

function statusBadgeVariant(status: string): "outline" | "success" | "warning" | "failed" {
  if (status === "completed") return "success";
  if (status === "failed") return "failed";
  if (status === "working" || status === "awaiting_human") return "warning";
  return "outline";
}

function TruncatedTextBlock({ text, limit = DEFAULT_TRUNCATE_LEN }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= limit) {
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-200">
        {text}
      </pre>
    );
  }
  const Icon = expanded ? ChevronDown : ChevronRight;
  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={expanded}
        className="inline-flex max-w-full items-start gap-1 rounded-sm px-1 -mx-1 py-0.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-zinc-200"
        onClick={() => setExpanded((open) => !open)}
      >
        <Icon className="mt-0.5 size-3 shrink-0 opacity-60" aria-hidden />
        <span className="min-w-0 font-mono whitespace-pre-wrap break-words text-zinc-200">
          {expanded ? "Show less" : `${text.slice(0, limit)}…`}
        </span>
      </button>
      {expanded ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-200">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

export interface StepExecutorOutputPanelProps {
  run: RunDetailPayload;
  stepId: string | undefined;
  journalEntries?: JournalEntryItem[];
  graphStepIds?: string[];
  onSelectStep?: (stepId: string) => void;
  className?: string;
}

export function StepExecutorOutputPanel({
  run,
  stepId,
  journalEntries,
  graphStepIds,
  onSelectStep,
  className,
}: StepExecutorOutputPanelProps) {
  const stepIds = listInspectableStepIds(run, graphStepIds);
  const activeStepId = stepId && stepIds.includes(stepId) ? stepId : stepIds[0];
  const memo = run.steps?.find((s) => s.step_id === activeStepId);
  const sections = activeStepId
    ? buildStepExecutorOutputSections(run, activeStepId, journalEntries)
    : null;

  const stepStatuses = useMemo(
    () => new Map((run.steps ?? []).map((step) => [step.step_id, step.status])),
    [run.steps],
  );

  return (
    <div
      data-testid="step-executor-output-panel"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-zinc-950 text-zinc-100",
        className,
      )}
    >
      <div className="shrink-0 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">Executor output</p>
            <p className="truncate font-mono text-[11px] text-zinc-500">
              {activeStepId ?? "Select a step"}
            </p>
          </div>
          {memo?.status ? (
            <Badge variant={statusBadgeVariant(memo.status)} className="shrink-0 capitalize">
              {memo.status.replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>

        {stepIds.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
            {stepIds.map((id) => {
              const status = stepStatuses.get(id);
              const active = id === activeStepId;
              const short = shortStepLabel(id);
              return (
                <button
                  key={id}
                  type="button"
                  title={id}
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-[5.5rem] max-w-[9rem] flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "border-zinc-600 bg-zinc-800 text-zinc-50"
                      : "border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200",
                  )}
                  onClick={() => onSelectStep?.(id)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        statusTone[status ?? "pending"] ?? "bg-zinc-500",
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-xs font-medium">{short}</span>
                  </span>
                  {short !== id ? (
                    <span className="truncate font-mono text-[9px] text-zinc-500">{id}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {sections ? (
          sections.map((section, index) => {
            if (section.kind === "heading") {
              return (
                <h3
                  key={`${section.text}-${index}`}
                  className="border-b border-zinc-800 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                >
                  {section.text}
                </h3>
              );
            }
            if (section.kind === "agent_stdout") {
              return (
                <AgentStreamView
                  key={`agent-${index}`}
                  events={section.events}
                  live={section.live}
                />
              );
            }
            if (section.kind === "data") {
              return (
                <div key={`${section.label}-${index}`} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{section.label}</p>
                  <DataTableView value={section.value} truncateAt={80} />
                </div>
              );
            }
            return <TruncatedTextBlock key={`text-${index}`} text={section.text} limit={80} />;
          })
        ) : (
          <p className="text-xs text-zinc-400">Select a step on the flowchart to inspect shell executor output.</p>
        )}
      </div>
    </div>
  );
}
