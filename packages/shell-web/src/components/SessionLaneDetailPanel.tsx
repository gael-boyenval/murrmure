import { Link } from "react-router-dom";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";

export type SessionLaneDetail = {
  run_id: string;
  lifecycle: string;
  label?: string;
  space_label?: string;
  error_summary?: string;
  last_step?: string;
  started_at?: string;
};

function lifecycleBadgeVariant(
  lifecycle: string,
): "outline" | "running" | "failed" | "success" | "warning" {
  if (lifecycle === "working") return "running";
  if (lifecycle === "failed" || lifecycle === "cancelled") return "failed";
  if (lifecycle === "completed") return "success";
  if (lifecycle === "waiting" || lifecycle === "input-required") return "warning";
  return "outline";
}

function formatLifecycle(lifecycle: string): string {
  return lifecycle.replace(/-/g, " ");
}

export interface SessionLaneDetailPanelProps {
  lane: SessionLaneDetail | undefined;
  onRetry?: () => void;
  retryLoading?: boolean;
}

export function SessionLaneDetailPanel({ lane, onRetry, retryLoading }: SessionLaneDetailPanelProps) {
  if (!lane) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lane detail</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Select a lane in the flowchart or runs list.</p>
        </CardContent>
      </Card>
    );
  }

  const canRetry = lane.lifecycle === "failed" || lane.lifecycle === "cancelled";
  const laneTitle = lane.label ?? lane.run_id;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Lane detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{laneTitle}</span>
          <Badge variant={lifecycleBadgeVariant(lane.lifecycle)}>{formatLifecycle(lane.lifecycle)}</Badge>
        </div>

        <div className="space-y-1 text-muted-foreground">
          <p>
            <span className="text-foreground">Run </span>
            <Link to={`/runs/${lane.run_id}`} className="font-mono text-primary underline">
              {lane.run_id}
            </Link>
          </p>
          {lane.space_label ? <p>Space: {lane.space_label}</p> : null}
          {lane.last_step ? <p>Last step: {lane.last_step}</p> : null}
          {lane.started_at ? <p>Started: {new Date(lane.started_at).toLocaleString()}</p> : null}
        </div>

        {lane.error_summary ? (
          <p className="rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5 text-red-300">
            {lane.error_summary}
          </p>
        ) : null}

        {canRetry && onRetry ? (
          <div className="space-y-1 pt-1">
            <Button variant="outline" size="sm" disabled={retryLoading} onClick={onRetry}>
              {retryLoading ? "Retrying…" : `Retry ${laneTitle} lane`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Creates a new run referencing this lane&apos;s failed attempt.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
