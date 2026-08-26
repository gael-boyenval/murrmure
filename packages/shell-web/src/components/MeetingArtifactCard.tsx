import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { ShellClientHttpError } from "@murrmure/shell-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";
import { MeetingMarkdown } from "./MeetingMarkdown.js";
import type { MeetingReplyTarget } from "../lib/meeting-reply.js";

function isMarkdownName(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

export function meetingArtifactQueryKey(sessionId: string, transferId: string) {
  return ["meeting-artifact", sessionId, transferId] as const;
}

function ArtifactPreviewBody({
  name,
  text,
}: {
  name: string;
  text: string;
}) {
  return isMarkdownName(name) ? (
    <MeetingMarkdown text={text} />
  ) : (
    <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">{text}</pre>
  );
}

export function MeetingArtifactCard({
  transferId,
  sessionId,
  compact,
  onReply,
  messageId,
  fromLabel,
  participantId,
}: {
  transferId: string;
  sessionId: string;
  compact?: boolean;
  onReply?: (target: MeetingReplyTarget) => void;
  messageId?: string;
  fromLabel?: string;
  participantId?: string;
}) {
  const client = useShellClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: meetingArtifactQueryKey(sessionId, transferId),
    queryFn: () => client!.sessions.getMeetingArtifact(sessionId, transferId, { preview: true }),
    enabled: Boolean(client && sessionId),
  });

  const name = query.data?.artifact.name ?? transferId;
  const size = query.data?.artifact.size_bytes;
  const preview = query.data?.preview;
  const missing =
    query.error instanceof ShellClientHttpError && query.error.body.code === "ARTIFACT_NOT_FOUND";

  const citeTarget = (withReply: boolean): MeetingReplyTarget => ({
    ...(withReply && messageId ? { message_id: messageId, participant_id: participantId } : {}),
    preview: name,
    fromLabel: fromLabel ?? name,
    cite: { transfer_id: transferId, name },
  });

  return (
    <div
      data-testid={`meeting-artifact-${transferId}`}
      className="relative mt-1.5 max-w-xl rounded-md border border-border bg-background/50 p-2.5 pr-10"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-7 w-7 p-0"
        aria-label={`Expand ${name}`}
        onClick={() => setOpen(true)}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <p className="truncate text-sm font-medium">{name}</p>
      <p className="text-xs text-muted-foreground">
        {transferId}
        {typeof size === "number" ? ` · ${size} bytes` : ""}
        {preview?.truncated ? " · preview truncated" : ""}
      </p>
      {query.isError ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {missing ? "Attachment expired or removed." : "Could not load attachment."}
        </p>
      ) : null}
      {!compact && preview?.text ? (
        <div className="mt-2 max-h-64 overflow-auto rounded bg-muted/50 px-2.5 py-2">
          <ArtifactPreviewBody name={preview.name} text={preview.text} />
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="pr-8">{name}</DialogTitle>
            <DialogDescription>
              {transferId}
              {typeof size === "number" ? ` · ${size} bytes` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-md bg-muted/50 px-3 py-2">
            {preview?.text ? (
              <ArtifactPreviewBody name={preview.name} text={preview.text} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {missing ? "Attachment expired or removed." : "No text preview."}
              </p>
            )}
          </div>
          {onReply ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onReply(citeTarget(false));
                  setOpen(false);
                }}
              >
                Cite
              </Button>
              {messageId ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onReply(citeTarget(true));
                    setOpen(false);
                  }}
                >
                  Reply
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
