import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RunDetailPayload } from "@murrmure/shell-client";
import { pickDefaultStepId } from "../lib/step-executor-output.js";
import { ACTIVE_RUN_POLL_MS } from "../lib/invalidate-run-queries.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function useRunStepInspector(input: {
  run: RunDetailPayload | undefined;
  sessionId?: string;
  graphStepIds?: string[];
  pollWhileActive?: boolean;
}) {
  const client = useShellClient();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();

  const stepStateKey =
    input.run?.steps?.map((s) => `${s.step_id}:${s.status}`).join("|") ?? "";

  useEffect(() => {
    if (!input.run) return;
    setSelectedStepId(pickDefaultStepId(input.run, input.graphStepIds));
  }, [input.run, input.graphStepIds?.join(","), stepStateKey]);

  const journalQuery = useQuery({
    queryKey: ["journal", input.sessionId, input.run?.run_id],
    queryFn: () => client!.journal.query({ session: input.sessionId! }),
    enabled: Boolean(client && input.sessionId && input.run?.run_id),
    refetchInterval: input.pollWhileActive ? ACTIVE_RUN_POLL_MS : false,
  });

  return {
    selectedStepId,
    setSelectedStepId,
    journalEntries: journalQuery.data,
    journalLoading: journalQuery.isLoading,
  };
}
