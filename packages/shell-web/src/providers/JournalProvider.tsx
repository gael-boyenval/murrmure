import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { JOURNAL_SSE_EVENTS } from "@murrmure/shell-client";
import { useShellClient } from "./ShellClientProvider.js";

const INVALIDATION_EVENTS = new Set<string>([
  ...JOURNAL_SSE_EVENTS.filter((e) => e !== "heartbeat"),
]);

const NOTIFICATION_INVALIDATION_EVENTS = new Set<string>([
  "gate.pending",
  "gate.resolved",
  "notification.changed",
]);

export function JournalProvider({ children }: { children: ReactNode }) {
  const client = useShellClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!client) return;

    return client.journal.subscribe((payload) => {
      if (!INVALIDATION_EVENTS.has(payload.event)) return;

      void queryClient.invalidateQueries({ queryKey: ["spaces"] });

      if (NOTIFICATION_INVALIDATION_EVENTS.has(payload.event)) {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }

      const spaceId = payload.data.space_id;
      if (typeof spaceId === "string") {
        void queryClient.invalidateQueries({ queryKey: ["space", spaceId] });
        void queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] });
        void queryClient.invalidateQueries({ queryKey: ["runs", spaceId] });
        void queryClient.invalidateQueries({ queryKey: ["journal"] });
      }
    });
  }, [client, queryClient]);

  return children;
}
