import { useCallback, useEffect, useState } from "react";
import type { SessionJson } from "@studio/review-contracts";
import { client } from "../api";

export interface UseSessionResult {
  session: SessionJson | null;
  connected: boolean;
  error: string | null;
  /** Bumps when a new review round starts so the preview iframe hard-reloads. */
  previewRevision: number;
  refetch: () => void;
}

/** Load a session and keep it fresh by refetching on every SSE event. */
export function useSession(key: string | undefined): UseSessionResult {
  const [session, setSession] = useState<SessionJson | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);

  const refetch = useCallback(() => {
    if (!key) return;
    client.sessions
      .get(key)
      .then((next) => {
        setSession(next);
        setError(null);
        setPreviewRevision((prev) => Math.max(prev, next.review_round));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [key]);

  useEffect(() => {
    if (!key) return;
    refetch();
    const unsubscribe = client.sessions.subscribeEvents(
      key,
      (event) => {
        setConnected(true);
        if (event.type === "review.round_start") {
          setPreviewRevision(event.payload.round);
        }
        refetch();
      },
      () => setConnected(false),
    );
    return unsubscribe;
  }, [key, refetch]);

  return { session, connected, error, previewRevision, refetch };
}
