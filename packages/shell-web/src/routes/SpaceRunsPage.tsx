import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "../layout/AppShell.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function SpaceRunsPage() {
  const { spaceId } = useParams();
  const client = useShellClient();
  const runsQuery = useQuery({
    queryKey: ["space-runs", spaceId],
    queryFn: () => client!.spaces.runs(spaceId!),
    enabled: Boolean(client && spaceId),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Link to={`/spaces/${spaceId}`} className="text-sm text-muted-foreground hover:underline">
          ← Back to space
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Run history</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading runs…</p> : null}
            {runsQuery.data?.runs.map((run) => (
              <Link
                key={run.run_id}
                to={`/runs/${run.run_id}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0 hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{run.title ?? run.flow_id ?? run.run_id}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{run.run_id}</span>
                </span>
                <Badge variant="outline">{run.lifecycle}</Badge>
              </Link>
            ))}
            {!runsQuery.isLoading && !runsQuery.data?.runs.length ? (
              <p className="text-sm text-muted-foreground">No runs yet</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
