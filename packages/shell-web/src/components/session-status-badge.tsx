import { Badge } from "@murrmure/shell-ui";

/** Map session status to shell-ui badge variant and label (CC-12). */
export function sessionStatusBadgeProps(status: string): {
  variant: "outline" | "warning" | "failed" | "success" | "gate";
  label: string;
} {
  switch (status) {
    case "partial_failure":
      return { variant: "warning", label: "Partial failure" };
    case "failed":
      return { variant: "failed", label: "Failed" };
    case "completed":
      return { variant: "success", label: "Completed" };
    case "cancelled":
      return { variant: "outline", label: "Cancelled" };
    default:
      return { variant: "outline", label: status.replace(/_/g, " ") };
  }
}

export function SessionStatusBadge({ status }: { status: string }) {
  const { variant, label } = sessionStatusBadgeProps(status);
  return <Badge variant={variant}>{label}</Badge>;
}

/** Show partial_failure when any child run failed while session is still active. */
export function displaySessionStatus(
  apiStatus: string | undefined,
  runLifecycles: string[],
): string {
  if (runLifecycles.some((l) => l === "failed" || l === "cancelled")) {
    if (apiStatus === "partial_failure" || runLifecycles.some((l) => l === "failed")) {
      const hasActive = runLifecycles.some(
        (l) => l === "working" || l === "waiting" || l === "input-required",
      );
      if (hasActive || apiStatus === "active") return "partial_failure";
    }
  }
  return apiStatus ?? "active";
}
