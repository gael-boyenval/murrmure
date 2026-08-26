import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

export interface MeetingResumeButtonProps {
  sessionId: string;
  onResumed?: () => void | Promise<void>;
}

/** Human-chair resume. Same room, same seats, new persistent processes. */
export function MeetingResumeButton({ sessionId, onResumed }: MeetingResumeButtonProps) {
  const client = useShellClient();
  const queryClient = useQueryClient();

  const resume = useMutation({
    mutationFn: () => client!.sessions.resumeMeeting(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-transcript", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["meetings"] }),
      ]);
      await onResumed?.();
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={resume.isPending}
      onClick={() => resume.mutate()}
    >
      {resume.isPending ? "Resuming…" : "Resume"}
    </Button>
  );
}
