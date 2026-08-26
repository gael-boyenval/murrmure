import { useEffect, useState, type FormEvent } from "react";
import type { MeetingTranscript } from "@murrmure/shell-client";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";
import type { MeetingReplyTarget } from "../lib/meeting-reply.js";
import { meetingSeatLabel, type SpaceLabelMap } from "./MeetingTranscriptPane.js";

export interface MeetingComposerProps {
  sessionId: string;
  transcript: MeetingTranscript;
  spaceLabels?: SpaceLabelMap;
  replyTo?: MeetingReplyTarget | null;
  onClearReply?: () => void;
  onSent?: () => void | Promise<void>;
}

export function MeetingComposer({
  sessionId,
  transcript,
  spaceLabels,
  replyTo,
  onClearReply,
  onSent,
}: MeetingComposerProps) {
  const client = useShellClient();
  const [text, setText] = useState("");
  const [toAll, setToAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!replyTo?.participant_id) return;
    setToAll(false);
    setSelected(new Set([replyTo.participant_id]));
  }, [replyTo]);

  const toggleSeat = (participantId: string) => {
    setToAll(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    const citeId = replyTo?.cite?.transfer_id;
    if (!client || (!message && !citeId) || (!toAll && selected.size === 0)) return;
    setSending(true);
    setError(undefined);
    try {
      await client.sessions.sayMeeting(sessionId, {
        to: toAll ? { all: true } : { participant_ids: [...selected] },
        ...(message ? { text: message } : {}),
        ...(replyTo?.message_id ? { in_reply_to: replyTo.message_id } : {}),
        ...(citeId ? { artifacts: [citeId] } : {}),
      });
      setText("");
      onClearReply?.();
      await onSent?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 shrink-0 space-y-2 border-t border-border pt-3">
      {replyTo ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
          <p className="min-w-0">
            {replyTo.message_id ? (
              <span className="text-muted-foreground">Replying to {replyTo.fromLabel}</span>
            ) : (
              <span className="text-muted-foreground">Citing</span>
            )}
            {replyTo.cite ? (
              <span className="ml-1 truncate text-foreground">
                {replyTo.cite.name ?? replyTo.cite.transfer_id}
              </span>
            ) : replyTo.preview ? (
              <span className="ml-1 truncate text-foreground">— {replyTo.preview}</span>
            ) : null}
          </p>
          <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5" onClick={onClearReply}>
            Cancel
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>To</span>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={toAll}
            onChange={() => {
              setToAll(true);
              setSelected(new Set());
            }}
          />
          Everyone
        </label>
        {transcript.roster.map((seat) => (
          <label key={seat.participant_id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={!toAll && selected.has(seat.participant_id)}
              onChange={() => toggleSeat(seat.participant_id)}
            />
            {meetingSeatLabel(seat, spaceLabels)}
          </label>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          aria-label="Message"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Message the room"
          className="min-h-16 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          type="submit"
          disabled={sending || (!text.trim() && !replyTo?.cite) || (!toAll && selected.size === 0)}
        >
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
