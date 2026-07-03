import type { NotificationItem } from "@murrmure/shell-client";
import { Badge } from "@murrmure/shell-ui";

export type NotificationKindLabel = "Gate" | "Failed" | "Validation";

/** Map notification kind to inbox badge label and shell-ui variant. */
export function notificationKindBadgeProps(n: NotificationItem): {
  variant: "gate" | "failed" | "warning";
  label: NotificationKindLabel;
} {
  if (n.kind === "run_failed") {
    return { variant: "failed", label: "Failed" };
  }
  const isValidation =
    n.title.toLowerCase().includes("validate") ||
    n.title.toLowerCase().includes("orchestration");
  if (isValidation) {
    return { variant: "warning", label: "Validation" };
  }
  return { variant: "gate", label: "Gate" };
}

export function NotificationKindBadge({ notification }: { notification: NotificationItem }) {
  const { variant, label } = notificationKindBadgeProps(notification);
  return <Badge variant={variant}>{label}</Badge>;
}
