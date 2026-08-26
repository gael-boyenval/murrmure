import { useQuery } from "@tanstack/react-query";
import { cn } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { MeetingArtifactCard, meetingArtifactQueryKey } from "./MeetingArtifactCard.js";
import type { MeetingArtifactRef } from "../lib/meeting-artifacts.js";
import type { MeetingReplyTarget } from "../lib/meeting-reply.js";
import { meetingClockTime } from "../lib/meeting-time.js";

export function MeetingArtifactsRail({
  sessionId,
  artifacts,
  selectedId,
  onSelect,
  onReply,
}: {
  sessionId: string;
  artifacts: MeetingArtifactRef[];
  selectedId?: string;
  onSelect: (ref: MeetingArtifactRef) => void;
  onReply?: (target: MeetingReplyTarget) => void;
}) {
  return (
    <aside
      data-testid="meeting-artifacts-rail"
      className="flex w-64 shrink-0 flex-col border-l border-border pl-3"
    >
      <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Artifacts ({artifacts.length})
      </h3>
      <ul className="scrollbar-subtle mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {artifacts.map((ref) => (
          <li key={ref.transfer_id}>
            <ArtifactRailButton
              sessionId={sessionId}
              artifact={ref}
              selected={selectedId === ref.transfer_id}
              onSelect={() => onSelect(ref)}
            />
          </li>
        ))}
      </ul>
      {selectedId ? (
        <div className="mt-2 shrink-0 border-t border-border pt-2">
          <MeetingArtifactCard
            transferId={selectedId}
            sessionId={sessionId}
            compact
            onReply={onReply}
            messageId={artifacts.find((row) => row.transfer_id === selectedId)?.message_id}
            fromLabel={artifacts.find((row) => row.transfer_id === selectedId)?.fromLabel}
            participantId={artifacts.find((row) => row.transfer_id === selectedId)?.participant_id}
          />
        </div>
      ) : (
        <p className="mt-2 shrink-0 text-xs text-muted-foreground">Select a file to preview.</p>
      )}
    </aside>
  );
}

function ArtifactRailButton({
  sessionId,
  artifact,
  selected,
  onSelect,
}: {
  sessionId: string;
  artifact: MeetingArtifactRef;
  selected: boolean;
  onSelect: () => void;
}) {
  const client = useShellClient();
  const query = useQuery({
    queryKey: meetingArtifactQueryKey(sessionId, artifact.transfer_id),
    queryFn: () =>
      client!.sessions.getMeetingArtifact(sessionId, artifact.transfer_id, { preview: true }),
    enabled: Boolean(client && sessionId),
  });
  const name = query.data?.artifact.name ?? artifact.transfer_id;

  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
        selected ? "bg-muted" : undefined,
      )}
      onClick={onSelect}
    >
      <span className="block truncate font-medium text-foreground">{name}</span>
      <span className="block truncate text-muted-foreground">
        {artifact.fromLabel}
        {meetingClockTime(artifact.created_at) ? ` · ${meetingClockTime(artifact.created_at)}` : ""}
      </span>
    </button>
  );
}
