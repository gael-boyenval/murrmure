import type { RunDetailPayload } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";

export interface JournalWaterfallViewProps {
  run: RunDetailPayload;
  journalEntries?: Array<{ type: string; time: string; data: Record<string, unknown> }>;
}

const statusIcon = (status: string) => {
  if (status === "completed") return "✓";
  if (status === "failed") return "✗";
  return "●";
};

export function JournalWaterfallView({ run, journalEntries }: JournalWaterfallViewProps) {
  const steps = run.journal_replay ?? run.steps ?? [];

  return (
    <div className="space-y-2 rounded-md border border-border p-4">
      <p className="text-sm font-medium">Journal replay</p>
      {steps.length === 0 && !journalEntries?.length ? (
        <p className="text-sm text-muted-foreground">No step history yet.</p>
      ) : null}
      <ul className="space-y-2 text-sm font-mono">
        {steps.map((step) => (
          <li key={step.step_id} className="flex items-center gap-2">
            <span className={step.status === "failed" ? "text-red-500" : "text-green-500"}>
              [{statusIcon(step.status)}]
            </span>
            <span>{step.step_id}</span>
            <Badge variant="outline">{step.status}</Badge>
          </li>
        ))}
        {(journalEntries ?? []).map((entry) => (
          <li key={`${entry.type}-${entry.time}`} className="flex items-center gap-2 text-muted-foreground">
            <span>[{statusIcon("working")}]</span>
            <span>{entry.time.slice(11, 19)}</span>
            <span>{entry.type.replace(/^mrmr\./, "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
