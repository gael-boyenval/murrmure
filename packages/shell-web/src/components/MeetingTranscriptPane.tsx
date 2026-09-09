import type { MeetingTranscript, MeetingTranscriptMessage } from "@murrmure/shell-client";
import { Badge, Button, cn } from "@murrmure/shell-ui";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MeetingArtifactCard } from "./MeetingArtifactCard.js";
import { MeetingArtifactsRail } from "./MeetingArtifactsRail.js";
import { MeetingMarkdown } from "./MeetingMarkdown.js";
import { listTranscriptArtifacts } from "../lib/meeting-artifacts.js";
import { meetingClockTime } from "../lib/meeting-time.js";
import { replyPreview, type MeetingReplyTarget } from "../lib/meeting-reply.js";

const SEAT_TONES = [
  "bg-sky-500/15 text-sky-200",
  "bg-violet-500/15 text-violet-200",
  "bg-emerald-500/15 text-emerald-200",
  "bg-amber-500/15 text-amber-200",
  "bg-rose-500/15 text-rose-200",
] as const;

export const MEETING_GOAL_AUTO_COLLAPSE_AFTER = 5;

export function shouldCollapseMeetingGoal(messageCount: number): boolean {
  return messageCount > MEETING_GOAL_AUTO_COLLAPSE_AFTER;
}

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
  return meetingSeatLabel(seat, labels);
}

function meetingSeatInitials(
  seat: { persona?: string; space_id: string },
  labels?: SpaceLabelMap,
): string {
  const persona = seat.persona?.charAt(0) ?? "";
  const space = spaceShort(seat.space_id, labels).charAt(0);
  return `${persona}${space}`.toUpperCase() || "?";
}

export function isHumanMeetingChair(chair: MeetingTranscript["chair"]): boolean {
  return "human" in chair && chair.human === true;
}

function isMeetingSeatSender(
  sender: MeetingTranscriptMessage["from"],
): sender is Extract<MeetingTranscriptMessage["from"], { space_id: string }> {
  return "space_id" in sender;
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

export { meetingClockTime } from "../lib/meeting-time.js";

function latencyLabel(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
}

export interface MeetingTranscriptPaneProps {
  title: string;
  goal?: string;
  transcript: MeetingTranscript;
  closeAction?: ReactNode;
  composer?: ReactNode;
  spaceLabels?: SpaceLabelMap;
  onReply?: (target: MeetingReplyTarget) => void;
  onReload?: () => void | Promise<void>;
}

export function MeetingTranscriptPane({
  title,
  goal,
  transcript,
  closeAction,
  composer,
  spaceLabels,
  onReply,
  onReload,
}: MeetingTranscriptPaneProps) {
  const seats = rosterMap(transcript);
  const byId = new Map(transcript.messages.map((message) => [message.message_id, message]));
  const [headerOpen, setHeaderOpen] = useState(
    () => !shouldCollapseMeetingGoal(transcript.messages.length),
  );
  const [reloadPending, setReloadPending] = useState(false);
  const [focusMessageId, setFocusMessageId] = useState<string>();
  const [selectedArtifact, setSelectedArtifact] = useState<string>();
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);
  const openedSession = useRef<string>();
  const artifacts = listTranscriptArtifacts(transcript, (message) => {
    const seat = isMeetingSeatSender(message.from) ? message.from : undefined;
    return seat ? meetingSpeakerName(seat, spaceLabels) : "human chair";
  });

  useEffect(() => {
    if (openedSession.current !== transcript.session_id) {
      openedSession.current = transcript.session_id;
      setHeaderOpen(!shouldCollapseMeetingGoal(transcript.messages.length));
      stickToBottom.current = true;
    } else if (shouldCollapseMeetingGoal(transcript.messages.length)) {
      setHeaderOpen(false);
    }
  }, [transcript.session_id, transcript.messages.length]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript.session_id, transcript.up_to_seq, transcript.messages.length]);

  const jumpTo = (messageId: string, transferId: string) => {
    stickToBottom.current = false;
    setSelectedArtifact(transferId);
    setFocusMessageId(messageId);
    document.getElementById(`meeting-msg-${messageId}`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    window.setTimeout(() => {
      setFocusMessageId((current) => (current === messageId ? undefined : current));
    }, 1600);
  };

  return (
    <div data-testid="meeting-transcript" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border pb-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              aria-expanded={headerOpen}
              aria-label={headerOpen ? "Minimize meeting header" : "Expand meeting header"}
              onClick={() => setHeaderOpen((open) => !open)}
            >
              {headerOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <Badge variant="outline">{transcript.status}</Badge>
          </div>
          {headerOpen ? (
            <>
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
            </>
          ) : null}
        </div>
        {closeAction || onReload ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {onReload ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reloadPending}
                aria-label="Reload transcript"
                onClick={() => {
                  stickToBottom.current = true;
                  setReloadPending(true);
                  void Promise.resolve(onReload()).finally(() => setReloadPending(false));
                }}
              >
                <RotateCw className={cn("size-3.5", reloadPending ? "animate-spin" : undefined)} />
                {reloadPending ? "Reloading…" : "Reload"}
              </Button>
            ) : null}
            {closeAction}
          </div>
        ) : null}
      </header>

      <div className="mt-3 flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ol
        ref={listRef}
        className="scrollbar-subtle min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {transcript.messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            Room is open. Seats were spawned on convene.
          </li>
        ) : (
          transcript.messages.map((message) => {
            const seat = isMeetingSeatSender(message.from) ? message.from : undefined;
            const fromName = seat ? meetingSpeakerName(seat, spaceLabels) : "human chair";
            const toName = targetNames(message, seats, spaceLabels);
            const parent = message.in_reply_to ? byId.get(message.in_reply_to) : undefined;
            const tone = seatTone(
              seat ? seat.persona ?? seat.participant_id : "human-chair",
            );
            const initials = seat ? meetingSeatInitials(seat, spaceLabels) : "HC";
            return (
              <li
                id={`meeting-msg-${message.message_id}`}
                key={message.message_id}
                className={cn(
                  "flex gap-3 rounded-md transition-colors",
                  message.in_reply_to ? "ml-6" : undefined,
                  focusMessageId === message.message_id ? "bg-muted/80 ring-1 ring-border" : undefined,
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    tone,
                  )}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{fromName}</span>
                    <span className="text-muted-foreground"> to {toName}</span>
                    <time
                      dateTime={message.created_at}
                      title={message.created_at}
                      className="ml-2 font-mono text-xs text-muted-foreground"
                    >
                      {meetingClockTime(message.created_at)}
                    </time>
                    {parent?.created_at ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        reply in{" "}
                        {latencyLabel(
                          Math.max(
                            0,
                            Date.parse(message.created_at) - Date.parse(parent.created_at),
                          ),
                        )}
                      </span>
                    ) : null}
                  </p>
                  {parent?.text ? (
                    <p className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                      {replyPreview(parent.text, 160)}
                    </p>
                  ) : null}
                  {message.text ? (
                    <div className="mt-1.5 max-w-xl rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5">
                      <MeetingMarkdown text={message.text} />
                    </div>
                  ) : null}
                  {message.artifacts && message.artifacts.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {message.artifacts.map((id) => (
                        <li key={id}>
                          <MeetingArtifactCard
                            transferId={id}
                            sessionId={transcript.session_id}
                            onReply={onReply}
                            messageId={message.message_id}
                            fromLabel={fromName}
                            participantId={seat?.participant_id}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {onReply ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-xs"
                      onClick={() =>
                        onReply({
                          message_id: message.message_id,
                          preview: replyPreview(message.text ?? ""),
                          fromLabel: fromName,
                          participant_id: seat?.participant_id,
                        })
                      }
                    >
                      Reply
                    </Button>
                  ) : null}
                  {message.receipts.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {message.receipts
                        .map((receipt) => {
                          const seat = seats.get(receipt.participant_id);
                          const label = seat ? meetingSpeakerName(seat, spaceLabels) : "seat";
                          if (receipt.status === "delivered") {
                            return `${label} delivered in ${latencyLabel(receipt.latency_ms)}`;
                          }
                          const reason = receipt.reason ? ` (${receipt.reason})` : "";
                          return `${label} failed in ${latencyLabel(receipt.latency_ms)}${reason}`;
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
      {composer}
      </div>
      {artifacts.length > 0 ? (
        <MeetingArtifactsRail
          sessionId={transcript.session_id}
          artifacts={artifacts}
          selectedId={selectedArtifact}
          onSelect={(ref) => jumpTo(ref.message_id, ref.transfer_id)}
          onReply={onReply}
        />
      ) : null}
      </div>
    </div>
  );
}
