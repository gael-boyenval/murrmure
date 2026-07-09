import { useMutation } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { useShellClient } from "../providers/ShellClientProvider.js";

const ACTIVE_LIFECYCLES = new Set(["working", "input-required"]);

export function canDismissRun(lifecycle: string | undefined): boolean {
  return Boolean(lifecycle && ACTIVE_LIFECYCLES.has(lifecycle));
}

export interface DismissRunButtonProps {
  runId: string;
  spaceId?: string;
  lifecycle?: string;
  onDismissed?: () => void | Promise<void>;
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function DismissRunButton({
  runId,
  spaceId,
  lifecycle,
  onDismissed,
  size = "sm",
  className,
}: DismissRunButtonProps) {
  const client = useShellClient();

  const dismiss = useMutation({
    mutationFn: () =>
      client!.runs.cancel(runId, spaceId ? { space_id: spaceId } : undefined),
    onSuccess: () => void onDismissed?.(),
  });

  if (!canDismissRun(lifecycle)) return null;

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
      {dismiss.isPending ? "Dismissing…" : "Dismiss"}
    </Button>
  );
}
