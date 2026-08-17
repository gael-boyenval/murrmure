import type { MeetingTranscript, MeetingTranscriptMessage } from "@murrmure/shell-client";
import { Badge, cn } from "@murrmure/shell-ui";
import type { ReactNode } from "react";

const SEAT_TONES = [
  "bg-sky-500/15 text-sky-200",
  "bg-violet-500/15 text-violet-200",
  "bg-emerald-500/15 text-emerald-200",
  "bg-amber-500/15 text-amber-200",
  "bg-rose-500/15 text-rose-200",
] as const;

export type SpaceLabelMap = Record<string, string>;

function spaceShort(space_id: string, labels?: SpaceLabelMap): string {
  const mapped = labels?.[space_id]?.trim();
  if (mapped) return mapped;
  const bare = space_id.replace(/^spc_/, "");
  if (/^01[0-9A-HJKMNP-TV-Z]{24}$/i.test(bare)) return "";
  return bare;
}

export function meetingSeatLabel(
  seat: { persona?: string; space_id: string },
  labels?: SpaceLabelMap,
): string {
  const space = spaceShort(seat.space_id, labels);
  if (seat.persona && space) return `${seat.persona}@${space}`;
  if (seat.persona) return seat.persona;
  if (space) return space;
  return seat.space_id.replace(/^spc_/, "");
}

export function meetingSpeakerName(seat: { persona?: string; space_id: string }, labels?: SpaceLabelMap): string {
  if (seat.persona) return seat.persona.charAt(0).toUpperCase() + seat.persona.slice(1);
  return meetingSeatLabel(seat, labels);
}

export function isHumanMeetingChair(chair: MeetingTranscript["chair"]): boolean {
  return "human" in chair && chair.human === true;
}

function rosterMap(transcript: MeetingTranscript): Map<string, { persona?: string; space_id: string }> {
  return new Map(transcript.roster.map((seat) => [seat.participant_id, seat]));
}

function seatTone(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return SEAT_TONES[hash % SEAT_TONES.length] ?? SEAT_TONES[0];
}

function targetNames(
  message: MeetingTranscriptMessage,
  seats: Map<string, { persona?: string; space_id: string }>,
  labels?: SpaceLabelMap,
): string {
  if (message.to.all) return "everyone";
  return message.to.participant_ids
    .map((id) => {
      const seat = seats.get(id);
      return seat ? meetingSpeakerName(seat, labels) : id;
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
  spaceLabels?: SpaceLabelMap;
}

export function MeetingTranscriptPane({
  title,
  goal,
  transcript,
  closeAction,
  spaceLabels,
}: MeetingTranscriptPaneProps) {
  const seats = rosterMap(transcript);
  const byId = new Map(transcript.messages.map((message) => [message.message_id, message]));

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
            {transcript.roster.map((seat) => (
              <span
                key={seat.participant_id}
                className="mr-2 font-medium text-foreground"
                title={seat.participant_id}
              >
                {meetingSeatLabel(seat, spaceLabels)}
              </span>
            ))}
          </p>
        </div>
        {closeAction}
      </header>

      <ol className="scrollbar-subtle mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {transcript.messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">No messages yet.</li>
        ) : (
          transcript.messages.map((message) => {
            const fromName = meetingSpeakerName(message.from, spaceLabels);
            const toName = targetNames(message, seats, spaceLabels);
            const parent = message.in_reply_to ? byId.get(message.in_reply_to) : undefined;
            const tone = seatTone(message.from.persona ?? message.from.participant_id);
            const initial = fromName.charAt(0).toUpperCase();
            return (
              <li
                key={message.message_id}
                className={cn("flex gap-3", message.in_reply_to ? "ml-6" : undefined)}
              >
                <div
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    tone,
                  )}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{fromName}</span>
                    <span className="text-muted-foreground"> to {toName}</span>
                  </p>
                  {parent?.text ? (
                    <p className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                      {parent.text}
                    </p>
                  ) : null}
                  {message.text ? (
                    <div className="mt-1.5 max-w-xl rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {message.text}
                      </p>
                    </div>
                  ) : null}
                  {message.artifacts && message.artifacts.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5 text-sm">
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
                      {message.receipts
                        .map((receipt) => {
                          const seat = seats.get(receipt.participant_id);
                          const label = seat ? meetingSpeakerName(seat, spaceLabels) : "seat";
                          if (receipt.status === "delivered") return `${label} delivered`;
                          const reason = receipt.reason ? ` (${receipt.reason})` : "";
                          return `${label} failed${reason}`;
                        })
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}
