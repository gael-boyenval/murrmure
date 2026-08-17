import type { MeetingTranscript, MeetingTranscriptMessage } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";
import type { ReactNode } from "react";

export function meetingSeatLabel(seat: { persona?: string; space_id: string }): string {
  const space = seat.space_id.replace(/^spc_/, "");
  return seat.persona ? `${seat.persona}@${space}` : space;
}

export function isHumanMeetingChair(chair: MeetingTranscript["chair"]): boolean {
  return "human" in chair && chair.human === true;
}

function rosterMap(transcript: MeetingTranscript): Map<string, { persona?: string; space_id: string }> {
  return new Map(transcript.roster.map((seat) => [seat.participant_id, seat]));
}

function targetLabels(message: MeetingTranscriptMessage, seats: Map<string, { persona?: string; space_id: string }>): string {
  if (message.to.all) return "everyone";
  return message.to.participant_ids
    .map((id) => {
      const seat = seats.get(id);
      return seat ? meetingSeatLabel(seat) : id;
    })
    .join(", ");
}

function artifactHref(transferId: string, spaceId?: string): string {
  const search = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
  return `/v1/artifacts/${encodeURIComponent(transferId)}${search}`;
}

export interface MeetingTranscriptPaneProps {
  title: string;
  goal?: string;
  transcript: MeetingTranscript;
  closeAction?: ReactNode;
}

export function MeetingTranscriptPane({ title, goal, transcript, closeAction }: MeetingTranscriptPaneProps) {
  const seats = rosterMap(transcript);

  return (
    <div data-testid="meeting-transcript" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <Badge variant="outline">{transcript.status}</Badge>
          </div>
          {goal ? <p className="text-sm text-muted-foreground">{goal}</p> : null}
          <p className="text-sm text-muted-foreground">
            Roster:{" "}
            {transcript.roster.map((seat) => (
              <span key={seat.participant_id} className="mr-2 font-medium text-foreground" title={seat.participant_id}>
                {meetingSeatLabel(seat)}
              </span>
            ))}
          </p>
        </div>
        {closeAction}
      </header>

      <ol className="scrollbar-subtle mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {transcript.messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">No messages yet.</li>
        ) : (
          transcript.messages.map((message) => {
            const fromLabel = meetingSeatLabel(message.from);
            const toLabel = targetLabels(message, seats);
            return (
              <li
                key={message.message_id}
                className={message.in_reply_to ? "ml-4 border-l border-border pl-3" : undefined}
              >
                <p className="text-sm font-medium" title={message.from.participant_id}>
                  {fromLabel} → {toLabel}
                </p>
                {message.in_reply_to ? (
                  <p className="text-xs text-muted-foreground">re: {message.in_reply_to}</p>
                ) : null}
                {message.text ? <p className="mt-1 whitespace-pre-wrap text-sm">{message.text}</p> : null}
                {message.artifacts && message.artifacts.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {message.artifacts.map((id) => (
                      <li key={id}>
                        <a
                          href={artifactHref(id, message.from.space_id)}
                          className="text-primary underline"
                        >
                          {id}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {message.receipts.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    receipts:{" "}
                    {message.receipts
                      .map((receipt) => {
                        const seat = seats.get(receipt.participant_id);
                        const label = seat ? meetingSeatLabel(seat) : receipt.participant_id;
                        const reason = receipt.reason ? ` (${receipt.reason})` : "";
                        return `${label} ${receipt.status}${reason}`;
                      })
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
