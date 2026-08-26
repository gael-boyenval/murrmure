import { describe, expect, test } from "vitest";
import { listMeetingSeatActivity } from "../../src/list-meeting-seats.js";
import { InMemoryLiveAssignments } from "../../src/live-assignments.js";

describe("listMeetingSeatActivity", () => {
  test("returns every roster seat and marks the live process", async () => {
    const live = new InMemoryLiveAssignments({} as never);
    await live.start({
      session_id: "ses_room",
      participant_id: "ptc_des",
      handler_id: "meeting-designer",
      run_id: "run_des",
    });
    const seats = await listMeetingSeatActivity({
      studio: {
        listRunsBySession: async () => [
          {
            run_id: "des",
            lifecycle: "working",
            exec_context: { event: { data: { participant_id: "ptc_des" } } },
          },
          {
            run_id: "res",
            lifecycle: "completed",
            exec_context: { event: { data: { participant_id: "ptc_res" } } },
          },
        ],
      } as never,
      liveAssignments: live,
      session_id: "ses_room",
      roster: [
        { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
        { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
      ],
    });
    expect(seats).toHaveLength(2);
    expect(seats[0]).toMatchObject({
      participant_id: "ptc_des",
      live: true,
      handler_id: "meeting-designer",
      run_id: "run_des",
      lifecycle: "working",
    });
    expect(seats[1]).toMatchObject({
      participant_id: "ptc_res",
      live: false,
      run_id: "run_res",
      lifecycle: "completed",
    });
  });
});
