import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

export interface MeetingCloseButtonProps {
  sessionId: string;
  onClosed?: () => void | Promise<void>;
}

/** Human-chair close. Not `gates.resolve` or `runs.cancel`. */
export function MeetingCloseButton({ sessionId, onClosed }: MeetingCloseButtonProps) {
  const client = useShellClient();
  const queryClient = useQueryClient();

  const close = useMutation({
    mutationFn: () => client!.sessions.closeMeeting(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["session-transcript", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
        queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] }),
      ]);
      await onClosed?.();
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={close.isPending}
      onClick={() => close.mutate()}
    >
      {close.isPending ? "Closing…" : "Close"}
    </Button>
  );
}
