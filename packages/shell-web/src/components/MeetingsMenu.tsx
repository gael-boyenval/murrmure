import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button, cn } from "@murrmure/shell-ui";
import type { MeetingListRow } from "@murrmure/shell-client";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { StartMeetingDialog } from "./StartMeetingDialog.js";

export function MeetingsMenu() {
  const client = useShellClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const query = useQuery({
    queryKey: ["meetings"],
    queryFn: () => client!.meetings.list(),
    enabled: Boolean(client),
    refetchInterval: 8_000,
  });
  const meetings = query.data?.meetings ?? [];
  const openCount = meetings.filter((meeting) => meeting.status === "open").length;

  const resume = useMutation({
    mutationFn: (sessionId: string) => client!.sessions.resumeMeeting(sessionId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setMenuOpen(false);
      navigate(`/sessions/${result.session_id}`);
    },
  });

  return (
    <div className="inline-flex isolate">
      <details
        className="relative"
        open={menuOpen}
        onToggle={(event) => setMenuOpen(event.currentTarget.open)}
      >
        <summary
          className={cn(
            "inline-flex h-8 cursor-pointer list-none items-center gap-2 rounded-md rounded-r-none border border-border px-3 text-xs font-medium",
            "hover:bg-accent hover:text-accent-foreground",
          )}
        >
          Meetings{openCount > 0 ? ` (${openCount})` : ""}
        </summary>
        <div
          data-testid="meetings-menu"
          className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-border bg-card p-2 shadow-md"
        >
          {query.isLoading ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading meetings…</p>
          ) : meetings.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No meetings yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {meetings.map((meeting) => (
                <MeetingMenuRow
                  key={meeting.session_id}
                  meeting={meeting}
                  resuming={resume.isPending && resume.variables === meeting.session_id}
                  onResume={() => resume.mutate(meeting.session_id)}
                  onOpen={() => setMenuOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      </details>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="-ml-px rounded-l-none"
        aria-label="New meeting"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </Button>
      <StartMeetingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function MeetingMenuRow({
  meeting,
  resuming,
  onResume,
  onOpen,
}: {
  meeting: MeetingListRow;
  resuming: boolean;
  onResume: () => void;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted">
      <Link
        to={`/sessions/${meeting.session_id}`}
        onClick={onOpen}
        className="min-w-0 flex-1"
      >
        <p className="truncate text-sm">{meeting.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {meeting.status}
          {meeting.goal ? ` · ${meeting.goal}` : ""}
        </p>
      </Link>
      {meeting.status === "closed" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={resuming}
          onClick={(event) => {
            event.preventDefault();
            onResume();
          }}
        >
          {resuming ? "Resuming…" : "Resume"}
        </Button>
      ) : null}
    </li>
  );
}
