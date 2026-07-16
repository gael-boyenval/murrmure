import type { QueryClient } from "@tanstack/react-query";

/** Invalidate shell queries that back run/session flowchart pages. */
export function invalidateRunStateQueries(
  queryClient: QueryClient,
  data: Record<string, unknown>,
): void {
  const runId = typeof data.run_id === "string" ? data.run_id : undefined;
  const sessionId = typeof data.session_id === "string" ? data.session_id : undefined;
  const spaceId = typeof data.space_id === "string" ? data.space_id : undefined;

  if (runId) {
    void queryClient.invalidateQueries({ queryKey: ["run", runId] });
    void queryClient.invalidateQueries({ queryKey: ["run-graph", runId] });
    void queryClient.invalidateQueries({ queryKey: ["gates", runId] });
  }

  if (sessionId) {
    void queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
    void queryClient.invalidateQueries({ queryKey: ["session-runs", sessionId] });
    if (runId) {
      void queryClient.invalidateQueries({ queryKey: ["journal", sessionId, runId] });
    } else {
      void queryClient.invalidateQueries({ queryKey: ["journal", sessionId] });
    }
  }

  if (spaceId) {
    void queryClient.invalidateQueries({ queryKey: ["space-home", spaceId] });
    void queryClient.invalidateQueries({ queryKey: ["space", spaceId] });
  }
}

export const ACTIVE_RUN_POLL_MS = 1000;

export function isActiveRunLifecycle(lifecycle: string | undefined): boolean {
  return lifecycle === "working" || lifecycle === "input-required";
}

export function activeRunRefetchInterval(lifecycle: string | undefined): number | false {
  return isActiveRunLifecycle(lifecycle) ? ACTIVE_RUN_POLL_MS : false;
}
