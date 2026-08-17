import { useQuery } from "@tanstack/react-query";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function useMeetingTranscript(sessionId: string | undefined) {
  const client = useShellClient();
  return useQuery({
    queryKey: ["session-transcript", sessionId],
    queryFn: () => client!.sessions.transcript(sessionId!),
    enabled: Boolean(client && sessionId),
  });
}
