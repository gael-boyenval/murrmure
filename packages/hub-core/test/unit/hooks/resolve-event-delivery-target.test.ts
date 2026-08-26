import { describe, expect, test } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { resolveEventDeliveryTarget } from "../../../src/hooks/dispatch.js";

const NOW = "2026-08-17T00:00:00.000Z";

async function studioWithSession(session_id = "room1") {
  const studio = new MemoryStudioPersistence();
  await studio.insertSession(
    {
      session_id,
      title: "Room",
      status: "active",
      created_by: { type: "actor", actor_id: "actor_alice" },
      spaces_touched: ["demo"],
      actor_id: "actor_alice",
    },
    NOW,
  );
  return studio;
}

describe("resolveEventDeliveryTarget", () => {
  test("no session_id → create", async () => {
    const studio = new MemoryStudioPersistence();
    const result = await resolveEventDeliveryTarget(
      { studio },
      {
        event_id: "evt_1",
        event_type: "brief.requested",
        space_id: "spc_demo",
        payload: {},
      },
    );
    expect(result).toEqual({ mode: "create", session_id: "" });
  });

  test("existing session → attach", async () => {
    const studio = await studioWithSession("room1");
    const result = await resolveEventDeliveryTarget(
      { studio },
      {
        event_id: "evt_2",
        event_type: "brief.requested",
        space_id: "spc_demo",
        session_id: "ses_room1",
        payload: {},
      },
    );
    expect(result).toEqual({ mode: "attach", session_id: "ses_room1" });
  });

  test("meeting missing session → MEETING_SESSION_REQUIRED", async () => {
    const studio = new MemoryStudioPersistence();
    const result = await resolveEventDeliveryTarget(
      { studio },
      {
        event_id: "evt_3",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        payload: { text: "hi" },
      },
    );
    expect(result).toEqual({
      denial: {
        code: MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED,
        message: "Meeting events require a top-level session_id",
      },
    });
  });

  test("meeting unknown session → SESSION_NOT_FOUND", async () => {
    const studio = new MemoryStudioPersistence();
    const result = await resolveEventDeliveryTarget(
      { studio },
      {
        event_id: "evt_4",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        session_id: "ses_missing",
        payload: {},
      },
    );
    expect(result).toMatchObject({
      denial: { code: MURRMURE_DENIAL_CODES.SESSION_NOT_FOUND },
    });
  });

  test("findLive hit selects notify_live", async () => {
    const studio = await studioWithSession("room1");
    let lookup: { session_id: string; participant?: string } | undefined;
    const result = await resolveEventDeliveryTarget(
      {
        studio,
        liveAssignments: {
          findLive: async (input) => {
            lookup = input;
            return { run_id: "run_live", handler_id: "meeting-designer" };
          },
          start: async () => undefined,
          notify: async () => undefined,
          revoke: async () => undefined,
        },
      },
      {
        event_id: "evt_6",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        session_id: "ses_room1",
        participant: "designer",
        participant_id: "ptc_designer",
        payload: {},
      },
    );
    expect(result).toEqual({
      mode: "notify_live",
      session_id: "ses_room1",
      run_id: "run_live",
    });
    expect(lookup).toEqual({
      session_id: "ses_room1",
      participant: "ptc_designer",
    });
  });

  test("liveAssignments undefined never selects notify_live", async () => {
    const studio = await studioWithSession("room1");
    const result = await resolveEventDeliveryTarget(
      { studio, liveAssignments: undefined },
      {
        event_id: "evt_5",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        session_id: "ses_room1",
        participant: "designer",
        payload: {},
      },
    );
    expect(result).toEqual({ mode: "attach", session_id: "ses_room1" });
  });
});
