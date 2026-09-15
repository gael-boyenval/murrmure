import { useMutation } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

const ACTIVE_LIFECYCLES = new Set(["working", "input-required"]);

export function canDismissRun(lifecycle: string | undefined): boolean {
  return Boolean(lifecycle && ACTIVE_LIFECYCLES.has(lifecycle));
}

export interface DismissRunButtonProps {
  runId?: string;
  meetingSessionId?: string;
  spaceId?: string;
  lifecycle?: string;
  onDismissed?: () => void | Promise<void>;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DismissRunButton({
  runId,
  meetingSessionId,
  spaceId,
  lifecycle,
  onDismissed,
  size = "sm",
  className,
}: DismissRunButtonProps) {
  const client = useShellClient();
  const stopMeeting = Boolean(meetingSessionId);

  const dismiss = useMutation({
    mutationFn: async () => {
      if (meetingSessionId) {
        await client!.sessions.closeMeeting(meetingSessionId);
        return;
      }
      if (!runId) {
        throw new Error("Dismiss requires a run or an open meeting");
      }
      await client!.runs.cancel(runId, spaceId ? { space_id: spaceId } : undefined);
    },
    onSuccess: () => void onDismissed?.(),
  });

  if (!stopMeeting && !canDismissRun(lifecycle)) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      disabled={dismiss.isPending}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dismiss.mutate();
      }}
    >
      {dismiss.isPending
        ? stopMeeting
          ? "Stopping…"
          : "Dismissing…"
        : stopMeeting
          ? "Stop meeting"
          : "Dismiss"}
    </Button>
  );
}
