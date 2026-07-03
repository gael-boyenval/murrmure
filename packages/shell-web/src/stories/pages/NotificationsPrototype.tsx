import { useEffect, useMemo, useRef } from "react";
import { fn } from "@storybook/test";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@murrmure/shell-ui";
import { GatePanel } from "../../components/GatePanel.js";
import { NotificationInboxItem } from "../../components/NotificationInboxItem.js";
import { ShellClientContext } from "../../providers/ShellClientProvider.js";
import { PrototypeShell } from "../prototype-shell.js";
import { createMockShellClient } from "../mock-shell-client.js";
import { notifications as prototypeNotifications, parallelGraph, reviewGate } from "../prototype-data.js";

const EMPTY_NOTIFICATIONS: typeof prototypeNotifications = [];

export type NotificationsPrototypeState = "empty" | "inbox" | "resolving-gate";

export function NotificationsPrototype({ state }: { state: NotificationsPrototypeState }) {
  const items = state === "empty" ? EMPTY_NOTIFICATIONS : prototypeNotifications;
  const showGate = state === "resolving-gate";
  const activeGateId = showGate ? reviewGate.gate_id : undefined;
  const activeRowRef = useRef<HTMLDivElement>(null);
  const client = useMemo(() => createMockShellClient(items), [items]);

  useEffect(() => {
    if (showGate) {
      activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [showGate]);

  return (
    <ShellClientContext.Provider value={client}>
    <PrototypeShell activePath="/notifications">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Actionable inbox — gates and failures.</p>
        </div>

        {showGate ? (
          <div
            id="notification-active-gate-panel"
            aria-controls="notification-active-gate-row"
            className="relative rounded-md ring-1 ring-primary/30"
          >
            <div
              className="pointer-events-none absolute -bottom-3 left-6 z-10 h-3 w-px bg-primary/40"
              aria-hidden="true"
            />
            <GatePanel gate={reviewGate} graph={parallelGraph} onSubmit={fn().mockResolvedValue(undefined)} />
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inbox</CardTitle>
            <CardDescription>{items.length} pending</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
            ) : (
              items.map((n) => (
                <NotificationInboxItem
                  key={n.notification_id}
                  ref={n.gate_id === activeGateId ? activeRowRef : undefined}
                  notification={n}
                  activeGateId={activeGateId}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PrototypeShell>
    </ShellClientContext.Provider>
  );
}
