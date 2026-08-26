import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { InMemoryLiveAssignments } from "./live-assignments.js";

export type MeetingSeatActivity = {
  participant_id: string;
  space_id: string;
  persona?: string;
  handler_id?: string;
  run_id?: string;
  live: boolean;
  lifecycle?: string;
};

function prefixedRunId(run_id: string): string {
  return run_id.startsWith("run_") ? run_id : `run_${run_id}`;
}

function runParticipantId(exec_context: Record<string, unknown> | undefined): string | undefined {
  const event = exec_context?.event as { data?: { participant_id?: unknown } } | undefined;
  const id = event?.data?.participant_id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

export async function listMeetingSeatActivity(input: {
  studio: StudioPersistencePort;
  liveAssignments: InMemoryLiveAssignments;
  session_id: string;
  roster: Array<{ participant_id: string; space_id: string; persona?: string }>;
}): Promise<MeetingSeatActivity[]> {
  const bare = input.session_id.startsWith("ses_") ? input.session_id.slice(4) : input.session_id;
  const runs = await input.studio.listRunsBySession(bare);
  const live = input.liveAssignments.list(input.session_id);
  const archives = input.liveAssignments.listArchives(input.session_id);

  return input.roster.map((seat) => {
    const liveSeat = live.find((row) => row.participant_id === seat.participant_id);
    const archived = archives.find((row) => row.participant_id === seat.participant_id);
    const run = runs.find((row) => runParticipantId(row.exec_context) === seat.participant_id);
    const run_id = liveSeat?.run_id ?? archived?.run_id ?? (run ? prefixedRunId(run.run_id) : undefined);
    return {
      participant_id: seat.participant_id,
      space_id: seat.space_id,
      persona: seat.persona,
      handler_id: liveSeat?.handler_id ?? archived?.handler_id,
      run_id,
      live: Boolean(liveSeat),
      lifecycle: run?.lifecycle,
    };
  });
}
