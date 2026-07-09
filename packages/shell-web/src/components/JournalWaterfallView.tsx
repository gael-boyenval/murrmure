import type { RunDetailPayload } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";
import { formatDateTimeCompact } from "../lib/format-display.js";
import { DataTableView } from "./DataTableView.js";

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
          <li key={`${entry.type}-${entry.time}`} className="space-y-1 text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>[{statusIcon("working")}]</span>
              <span title={entry.time}>{formatDateTimeCompact(entry.time)}</span>
              <span>{entry.type.replace(/^mrmr\./, "")}</span>
            </div>
            {Object.keys(entry.data).length > 0 ? (
              <DataTableView value={entry.data} className="ml-6" />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
