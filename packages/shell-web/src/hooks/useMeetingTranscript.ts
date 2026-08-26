import { useQuery } from "@tanstack/react-query";
import type { MeetingTranscript } from "@murrmure/shell-client";
import { useShellClient } from "../providers/ShellClientProvider.js";

export const OPEN_MEETING_POLL_MS = 1_000;

export function meetingTranscriptRefetchInterval(
  transcript: MeetingTranscript | null | undefined,
): number | false {
  return transcript?.status === "open" ? OPEN_MEETING_POLL_MS : false;
}

export function useMeetingTranscript(sessionId: string | undefined) {
  const client = useShellClient();
  return useQuery({
    queryKey: ["session-transcript", sessionId],
    queryFn: () => client!.sessions.transcript(sessionId!),
    enabled: Boolean(client && sessionId),
    // SSE invalidation is immediate. Polling is a safety net for a dropped or
    // reconnecting stream so an open room never looks frozen.
    refetchInterval: (query) => meetingTranscriptRefetchInterval(query.state.data),
  });
}
