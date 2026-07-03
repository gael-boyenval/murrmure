import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../layout/AppShell.js";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@murrmure/shell-ui";

const FILTER_KEYS = ["session", "space_id", "type", "since", "until"] as const;

export function LogsExplorerPage() {
  const client = useShellClient();
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const key of FILTER_KEYS) {
      const v = params.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [params]);

  const logsQuery = useQuery({
    queryKey: ["journal", filters],
    queryFn: () => client!.journal.query(filters),
    enabled: Boolean(client),
  });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <p className="text-sm text-muted-foreground">Journal explorer — retrieval only, not live flowchart.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTER_KEYS.map((key) => (
            <Badge
              key={key}
              variant={filters[key] ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const value = window.prompt(`Filter ${key}`, filters[key] ?? "");
                if (value !== null) setFilter(key, value);
              }}
            >
              {key}
              {filters[key] ? `: ${filters[key]}` : ""}
            </Badge>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            {logsQuery.isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
            {(logsQuery.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded border border-border p-2">
                <div className="flex flex-wrap gap-2 text-muted-foreground">
                  <span>{entry.time}</span>
                  <span>{entry.type}</span>
                  {entry.session_id ? <span>{entry.session_id}</span> : null}
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(entry.data, null, 0)}</pre>
              </div>
            ))}
            {!logsQuery.isLoading && (logsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">No journal entries match filters.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
