import type { RunDetailPayload } from "@murrmure/shell-client";
import { Badge, Button } from "@murrmure/shell-ui";

type JournalStep = { step_id: string; status: string; error?: string };

export interface JournalWaterfallViewProps {
  run: RunDetailPayload;
  journalEntries?: Array<{ type: string; time: string; data: Record<string, unknown> }>;
  /** When true, shows a pulsing live indicator (SSE subscription active). */
  isLive?: boolean;
  onRetry?: (stepId: string) => void;
  retryLoading?: boolean;
  retryingStepId?: string;
}

const PENDING_GATE_STATUSES = new Set(["pending", "gate", "input-required"]);

function stepBadgeVariant(status: string): "success" | "failed" | "running" | "gate" | "outline" {
  if (status === "completed") return "success";
  if (status === "failed") return "failed";
  if (status === "working") return "running";
  if (PENDING_GATE_STATUSES.has(status)) return "gate";
  return "outline";
}

function stepStatusIcon(status: string): string {
  if (status === "completed") return "✓";
  if (status === "failed") return "✗";
  if (PENDING_GATE_STATUSES.has(status)) return "!";
  return "●";
}

function stepStatusLabel(status: string): string {
  if (PENDING_GATE_STATUSES.has(status)) return "awaiting you";
  return status;
}

function stepRowTone(status: string): string {
  if (status === "failed") return "text-red-500";
  if (status === "completed") return "text-green-500";
  if (status === "working") return "text-amber-500";
  if (PENDING_GATE_STATUSES.has(status)) return "text-blue-400";
  return "text-muted-foreground";
}

export function JournalWaterfallView({
  run,
  journalEntries,
  isLive,
  onRetry,
  retryLoading,
  retryingStepId,
}: JournalWaterfallViewProps) {
  const steps = (run.journal_replay ?? run.steps ?? []) as JournalStep[];
  const events = journalEntries ?? [];
  const hasSteps = steps.length > 0;
  const hasEvents = events.length > 0;
  const showSections = hasSteps && hasEvents;

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium">Run progress (inferred)</p>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-green-500"
              aria-hidden="true"
            />
            <span className="sr-only">Live updates active</span>
            Live
          </span>
        ) : null}
      </div>

      {!hasSteps && !hasEvents ? (
        <p className="text-sm text-muted-foreground">No step history yet.</p>
      ) : null}

      {hasSteps ? (
        <div className="space-y-2">
          {showSections ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Steps</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {steps.map((step) => {
              const isFailed = step.status === "failed";
              const isPendingGate = PENDING_GATE_STATUSES.has(step.status);
              const canRetry = isFailed && onRetry;
              const isRetrying = retryLoading && retryingStepId === step.step_id;

              return (
                <li key={step.step_id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span className={stepRowTone(step.status)}>[{stepStatusIcon(step.status)}]</span>
                    <span>{step.step_id}</span>
                    <Badge variant={stepBadgeVariant(step.status)}>{stepStatusLabel(step.status)}</Badge>
                    {canRetry ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 font-sans"
                        disabled={retryLoading}
                        onClick={() => onRetry(step.step_id)}
                      >
                        {isRetrying ? "Retrying…" : "Retry"}
                      </Button>
                    ) : null}
                  </div>
                  {isFailed && step.error ? (
                    <p className="rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5 font-sans text-xs text-red-300">
                      {step.error}
                    </p>
                  ) : null}
                  {isPendingGate ? (
                    <p className="font-sans text-xs text-blue-300">Resolve the gate tab to continue.</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {hasEvents ? (
        <div className="space-y-2">
          {showSections ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Events</p>
          ) : null}
          <ul className="space-y-2 font-mono text-sm">
            {events.map((entry) => (
              <li key={`${entry.type}-${entry.time}`} className="flex items-center gap-2 text-muted-foreground">
                <span className="text-amber-500">[●]</span>
                <span>{entry.time.slice(11, 19)}</span>
                <span>{entry.type.replace(/^mrmr\./, "")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
