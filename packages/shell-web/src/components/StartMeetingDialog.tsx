import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@murrmure/shell-ui";
import { ShellClientHttpError, type SpacePersonaAd, type SpaceSummary } from "@murrmure/shell-client";
import { useShellClient } from "../providers/ShellClientProvider.js";
import {
  buildMeetingStartBody,
  seatKey,
  setSpaceSeats,
  spaceSelectionState,
  toggleSeat,
} from "../lib/start-meeting.js";

function spaceLabel(space: SpaceSummary): string {
  return space.name ?? space.slug ?? space.space_id;
}

function resetComposer(setters: {
  setTitle: (value: string) => void;
  setGoal: (value: string) => void;
  setSelected: (value: Set<string>) => void;
  setError: (value: string | null) => void;
}): void {
  setters.setTitle("");
  setters.setGoal("");
  setters.setSelected(new Set());
  setters.setError(null);
}

export function StartMeetingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useShellClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const spacesQuery = useQuery({
    queryKey: ["spaces"],
    queryFn: () => client!.spaces.list(),
    enabled: Boolean(client) && open,
  });

  const spaces = spacesQuery.data ?? [];

  const personaQueries = useQueries({
    queries: spaces.map((space) => ({
      queryKey: ["space-personas", space.space_id],
      queryFn: () => client!.spaces.personas(space.space_id),
      enabled: Boolean(client) && open,
    })),
  });

  const personasBySpace = useMemo(() => {
    const map = new Map<string, SpacePersonaAd[]>();
    spaces.forEach((space, index) => {
      map.set(space.space_id, personaQueries[index]?.data?.personas ?? []);
    });
    return map;
  }, [personaQueries, spaces]);

  const start = useMutation({
    mutationFn: () => client!.meetings.start(buildMeetingStartBody({ title, goal, selected })),
    onSuccess: (result) => {
      resetComposer({ setTitle, setGoal, setSelected, setError });
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["meetings"] });
      navigate(`/sessions/${result.session_id}`);
    },
    onError: (err) => {
      if (err instanceof ShellClientHttpError) {
        setError(err.message || `Could not start meeting (${err.status})`);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start meeting");
    },
  });

  const canStart = selected.size > 0 && !start.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          resetComposer({ setTitle, setGoal, setSelected, setError });
          start.reset();
        }
      }}
    >
        <DialogContent
          data-testid="start-meeting-dialog"
          className="max-h-[85vh] max-w-xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>New meeting</DialogTitle>
            <DialogDescription>
              Pick spaces and personas. You chair. Talk from Transcript; Close ends the room.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Meeting"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meeting-goal">What should they work on?</Label>
              <textarea
                id="meeting-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Goal for this room"
                rows={4}
                className="flex w-full rounded-md border border-border bg-muted/40 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Invite</legend>
              {spacesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading spaces…</p>
              ) : spaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spaces linked yet.</p>
              ) : (
                <ul className="space-y-3">
                  {spaces.map((space, index) => {
                    const personas = personasBySpace.get(space.space_id) ?? [];
                    const ids = personas.map((persona) => persona.id);
                    const spaceState = spaceSelectionState(selected, space.space_id, ids);
                    const loading = personaQueries[index]?.isLoading ?? false;
                    return (
                      <li key={space.space_id} className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`meeting-space-${space.space_id}`}
                            checked={spaceState}
                            disabled={loading || ids.length === 0}
                            onCheckedChange={(checked) => {
                              setSelected((current) =>
                                setSpaceSeats(current, space.space_id, ids, checked === true),
                              );
                            }}
                          />
                          <Label htmlFor={`meeting-space-${space.space_id}`} className="font-medium">
                            {spaceLabel(space)}
                          </Label>
                        </div>
                        {loading ? (
                          <p className="mt-2 pl-6 text-xs text-muted-foreground">Loading personas…</p>
                        ) : ids.length === 0 ? (
                          <p className="mt-2 pl-6 text-xs text-muted-foreground">
                            No personas indexed — apply personas.yaml
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2 pl-6">
                            {personas.map((persona) => {
                              const key = seatKey({
                                space_id: space.space_id,
                                persona: persona.id,
                              });
                              return (
                                <li key={key} className="flex items-start gap-2">
                                  <Checkbox
                                    id={`meeting-seat-${key}`}
                                    checked={selected.has(key)}
                                    onCheckedChange={() => {
                                      setSelected((current) =>
                                        toggleSeat(current, {
                                          space_id: space.space_id,
                                          persona: persona.id,
                                        }),
                                      );
                                    }}
                                  />
                                  <Label htmlFor={`meeting-seat-${key}`} className="leading-snug">
                                    <span className="font-medium">{persona.id}</span>
                                    <span className="block text-xs font-normal text-muted-foreground">
                                      {persona.summary}
                                    </span>
                                  </Label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={start.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                loading={start.isPending}
                disabled={!canStart}
                onClick={() => {
                  setError(null);
                  start.mutate();
                }}
              >
                Start meeting
              </Button>
            </div>
          </div>
        </DialogContent>
    </Dialog>
  );
}
