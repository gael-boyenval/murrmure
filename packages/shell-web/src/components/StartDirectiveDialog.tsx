import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
} from "@murrmure/shell-ui";
import type { SpaceSummary } from "@murrmure/shell-client";
import { useShellClient } from "../providers/ShellClientProvider.js";
import {
  eligibleSelectionState,
  isTerminalRunLifecycle,
  runResultMessage,
  setEligibleSpaces,
  startDirectiveRuns,
  toggleSpaceId,
  type DirectiveStartRow,
} from "../lib/start-directive.js";

function spaceLabel(space: Pick<SpaceSummary, "name" | "slug" | "space_id">): string {
  return space.name ?? space.slug ?? space.space_id;
}

function resetComposer(setters: {
  setPrompt: (value: string) => void;
  setSelected: (value: Set<string>) => void;
  setError: (value: string | null) => void;
  setStarts: (value: DirectiveStartRow[] | null) => void;
}): void {
  setters.setPrompt("");
  setters.setSelected(new Set());
  setters.setError(null);
  setters.setStarts(null);
}

export function StartDirectiveDialog() {
  const client = useShellClient();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [starts, setStarts] = useState<DirectiveStartRow[] | null>(null);

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client) && open,
  });
  const eligibleQuery = useQuery({
    queryKey: ["directives-eligible"],
    queryFn: () => client!.directives.eligible(),
    enabled: Boolean(client) && open,
  });

  const spaces = spacesQuery.data ?? [];
  const eligible = eligibleQuery.data?.spaces ?? [];
  const eligibleIds = useMemo(() => eligible.map((space) => space.space_id), [eligible]);
  const eligibleById = useMemo(
    () => new Map(eligible.map((space) => [space.space_id, space])),
    [eligible],
  );
  const spaceById = useMemo(
    () => new Map(spaces.map((space) => [space.space_id, space])),
    [spaces],
  );

  const start = useMutation({
    mutationFn: () =>
      startDirectiveRuns({
        runFlow: (flow_id, body) => client!.spaces.runFlow(flow_id, body),
        prompt,
        spaceIds: [...selected],
      }),
    onSuccess: (rows) => {
      setStarts(rows);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not start directive");
    },
  });

  const runIds = (starts ?? []).flatMap((row) => (row.ok ? [row.run_id] : []));
  const runQueries = useQueries({
    queries: runIds.map((run_id) => ({
      queryKey: ["directive-run", run_id],
      queryFn: () => client!.runs.get(run_id),
      enabled: Boolean(client) && open && Boolean(starts),
      refetchInterval: (query: { state: { data?: { lifecycle?: string } } }) =>
        isTerminalRunLifecycle(query.state.data?.lifecycle ?? "") ? false : 1000,
    })),
  });
  const runById = useMemo(() => {
    const map = new Map<string, (typeof runQueries)[number]["data"]>();
    runIds.forEach((run_id, index) => {
      map.set(run_id, runQueries[index]?.data);
    });
    return map;
  }, [runIds, runQueries]);

  const canStart = prompt.trim().length > 0 && selected.size > 0 && !start.isPending && !starts;
  const selectAllState = eligibleSelectionState(selected, eligibleIds);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" aria-hidden />
        New directive
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            resetComposer({ setPrompt, setSelected, setError, setStarts });
            start.reset();
          }
        }}
      >
        <DialogContent
          data-testid="start-directive-dialog"
          className="max-h-[85vh] max-w-xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>New directive</DialogTitle>
            <DialogDescription>
              One prompt, one run per selected space. Each space reports completed or failed with a
              message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="directive-prompt">Prompt</Label>
              <textarea
                id="directive-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="What should each space do?"
                rows={4}
                disabled={Boolean(starts)}
                className="flex w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <fieldset className="space-y-3" disabled={Boolean(starts)}>
              <legend className="text-sm font-medium">Spaces</legend>
              {spacesQuery.isLoading || eligibleQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading spaces…</p>
              ) : spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spaces linked yet.</p>
              ) : (
                <>
                  {eligibleIds.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="directive-select-all"
                        checked={selectAllState}
                        onCheckedChange={(checked) => {
                          setSelected((current) =>
                            setEligibleSpaces(current, eligibleIds, checked === true),
                          );
                        }}
                      />
                      <Label htmlFor="directive-select-all">Select all eligible</Label>
                    </div>
                  ) : null}
                  <ul className="space-y-3">
                    {spaces.map((space) => {
                      const canPick = eligibleById.has(space.space_id);
                      return (
                        <li key={space.space_id} className="rounded-md border border-border p-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`directive-space-${space.space_id}`}
                              checked={selected.has(space.space_id)}
                              disabled={!canPick}
                              onCheckedChange={() => {
                                if (!canPick) return;
                                setSelected((current) => toggleSpaceId(current, space.space_id));
                              }}
                            />
                            <Label
                              htmlFor={`directive-space-${space.space_id}`}
                              className={canPick ? "font-medium" : "font-medium text-muted-foreground"}
                            >
                              {spaceLabel(space)}
                            </Label>
                          </div>
                          {canPick ? null : (
                            <p className="mt-2 pl-6 text-xs text-muted-foreground">
                              No directive handler — apply the recipe
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </fieldset>

            {starts ? (
              <ul className="space-y-2" data-testid="directive-results">
                {starts.map((row) => {
                  const space = spaceById.get(row.space_id);
                  const run = row.ok ? runById.get(row.run_id) : undefined;
                  const lifecycle = row.ok ? (run?.lifecycle ?? "working") : "failed";
                  const message = row.ok ? runResultMessage(run ?? {}) : row.error;
                  return (
                    <li key={row.space_id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {space ? spaceLabel(space) : row.space_id}
                        </span>
                        <span className="text-xs text-muted-foreground">{lifecycle}</span>
                      </div>
                      {message ? <p className="mt-1 text-muted-foreground">{message}</p> : null}
                      {row.ok ? (
                        <Link
                          className="mt-2 inline-block text-xs underline"
                          to={`/sessions/${row.session_id}`}
                        >
                          Open session
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {starts ? "Close" : "Cancel"}
              </Button>
              {starts ? null : (
                <Button
                  type="button"
                  loading={start.isPending}
                  disabled={!canStart}
                  onClick={() => {
                    setError(null);
                    start.mutate();
                  }}
                >
                  Run directive
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
