import { useEffect, type ReactNode } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
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

const SPACE_INDEX_CHANGE_EVENTS = new Set<string>([
  "mrmr.space.index_updated",
  "flow.live_applied",
  "flow.dev_reload",
]);

export function invalidateSpaceScopedQueries(queryClient: QueryClient, spaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: ["space", spaceId] });
  void queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] });
  void queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] });
  void queryClient.invalidateQueries({ queryKey: ["runs", spaceId] });
  void queryClient.invalidateQueries({ queryKey: ["flow-preview", spaceId] });
  void queryClient.invalidateQueries({ queryKey: ["journal"] });
}

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

      const sessionId = payload.data.session_id;
      if (typeof sessionId === "string") {
        void queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
        void queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
      }

      const runId = payload.data.run_id;
      if (typeof runId === "string") {
        void queryClient.invalidateQueries({ queryKey: ["run", runId] });
        void queryClient.invalidateQueries({ queryKey: ["run-graph", runId] });
        void queryClient.invalidateQueries({ queryKey: ["gates", runId] });
      }

      const spaceId = payload.data.space_id;
      const isSpaceIndexChange =
        SPACE_INDEX_CHANGE_EVENTS.has(payload.event) ||
        payload.data.type === "mrmr.space.index_updated";

      if (typeof spaceId === "string") {
        if (isSpaceIndexChange) {
          invalidateSpaceScopedQueries(queryClient, spaceId);
        } else {
          void queryClient.invalidateQueries({ queryKey: ["space", spaceId] });
          void queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] });
          void queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] });
          void queryClient.invalidateQueries({ queryKey: ["runs", spaceId] });
          void queryClient.invalidateQueries({ queryKey: ["journal"] });
        }
      }
    });
  }, [client, queryClient]);

  return children;
}
