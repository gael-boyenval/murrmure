import { forwardRef } from "react";
import type { NotificationItem } from "@murrmure/shell-client";
import { Badge, cn } from "@murrmure/shell-ui";
import { NotificationKindBadge } from "./notification-kind-badge.js";

export interface NotificationInboxItemProps {
  notification: NotificationItem;
  /** Gate id currently open in the resolve panel — highlights and links this row. */
  activeGateId?: string;
  onDismiss?: () => void;
  /** When set, renders a link-styled primary action instead of a router Link. */
  runHref?: string;
  runLink?: React.ReactNode;
}

export const NotificationInboxItem = forwardRef<HTMLDivElement, NotificationInboxItemProps>(
  function NotificationInboxItem(
    { notification, activeGateId, onDismiss, runHref, runLink },
    ref,
  ) {
    const isActive = Boolean(activeGateId && notification.gate_id === activeGateId);

    return (
      <div
        ref={ref}
        id={isActive ? "notification-active-gate-row" : undefined}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "relative flex items-start justify-between gap-4 rounded-md border p-3 transition-colors",
          isActive
            ? "border-primary/60 bg-primary/5 shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
            : "border-border",
        )}
      >
        {isActive ? (
          <div
            className="pointer-events-none absolute -top-3 left-4 z-10"
            aria-hidden="true"
          >
            <div className="h-3 w-px bg-primary/40" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <NotificationKindBadge notification={notification} />
            {isActive ? (
              <Badge variant="outline" className="border-primary/50 text-primary">
                Resolving
              </Badge>
            ) : null}
          </div>
          <p className="text-sm font-medium">{notification.title}</p>
          {notification.summary ? (
            <p className="text-xs text-muted-foreground">{notification.summary}</p>
          ) : null}
          {runLink ??
            (runHref ? (
              <a className="text-xs text-primary underline" href={runHref}>
                Open run
              </a>
            ) : notification.run_id ? (
              <span className="text-xs text-primary underline">Open run</span>
            ) : null)}
        </div>
        <button
          type="button"
          className={cn(
            "shrink-0 text-xs hover:text-foreground",
            isActive ? "cursor-not-allowed text-muted-foreground/40" : "text-muted-foreground",
          )}
          disabled={isActive}
          aria-disabled={isActive}
          title={isActive ? "Dismiss unavailable while resolving this gate" : undefined}
          onClick={() => {
            if (!isActive && onDismiss) onDismiss();
          }}
        >
          Dismiss
        </button>
      </div>
    );
  },
);
