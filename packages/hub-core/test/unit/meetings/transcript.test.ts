import { describe, expect, test } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { JournalIndexRow, MeetingSessionRow } from "@murrmure/hub-persistence";
import { buildMeetingTranscript } from "../../../src/meetings/transcript.js";

const NOW = "2026-08-17T00:00:00.000Z";
const SES = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const APP = "spc_01ARZ3NDEKTSV4RRFFQ69G5FAA";
const RESEARCH = "spc_01ARZ3NDEKTSV4RRFFQ69G5FAR";
const DESIGNER = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAD";
const QA = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAQ";
const RESEARCHER = "ptc_01ARZ3NDEKTSV4RRFFQ69G5FAR";
const MSG1 = "msg_01ARZ3NDEKTSV4RRFFQ69G5FA1";
const MSG2 = "msg_01ARZ3NDEKTSV4RRFFQ69G5FA2";

const roster = [
  { participant_id: DESIGNER, space_id: APP, persona: "designer" },
  { participant_id: QA, space_id: APP, persona: "qa" },
  { participant_id: RESEARCHER, space_id: RESEARCH, persona: "researcher" },
];

function snapshot(status: "open" | "closed" = "open"): MeetingSessionRow {
  return {
    session_id: SES,
    status,
    title: "API shape",
    chair: { participant_id: DESIGNER },
    roster,
    convene_entry_id: "evt_convene",
    convene_meeting_seq: 1,
    updated_at: NOW,
  };
}

function row(input: {
  entry_id: string;
  type: string;
  meeting_seq: number;
  payload: Record<string, unknown>;
}): JournalIndexRow {
  return {
    entry_id: input.entry_id,
    seq: input.meeting_seq,
    space_id: "app",
    type: input.type,
    session_id: SES,
    time: NOW,
    meeting_seq: input.meeting_seq,
    payload_json: JSON.stringify(input.payload),
  };
}

async function seedJournal(
  studio: MemoryStudioPersistence,
  rows: JournalIndexRow[],
  snap?: MeetingSessionRow,
): Promise<void> {
  if (snap) await studio.upsertMeetingSnapshot(snap);
  for (const entry of rows) {
    await studio.insertJournalIndex(entry);
  }
}

describe("meetings/transcript", () => {
  test("folds meeting types only", async () => {
    const studio = new MemoryStudioPersistence();
    await seedJournal(
      studio,
      [
        row({
          entry_id: "evt_convene",
          type: JOURNAL_EVENT_TYPES.MEETING_CONVENED,
          meeting_seq: 1,
          payload: { roster, chair: { participant_id: DESIGNER } },
        }),
        row({
          entry_id: "evt_said",
          type: JOURNAL_EVENT_TYPES.MEETING_SAID,
          meeting_seq: 2,
          payload: {
            message_id: MSG1,
            from: { participant_id: DESIGNER, space_id: APP, persona: "designer" },
            to: { participant_ids: [RESEARCHER] },
            text: "Need the latency study.",
          },
        }),
        row({
          entry_id: "evt_hook",
          type: JOURNAL_EVENT_TYPES.HOOK_DELIVERED,
          meeting_seq: 3,
          payload: { hook_id: "meeting-researcher", text: "should not appear" },
        }),
        row({
          entry_id: "evt_delivered",
          type: JOURNAL_EVENT_TYPES.MEETING_DELIVERED,
          meeting_seq: 4,
          payload: { message_id: MSG1, participant_id: RESEARCHER },
        }),
      ],
      snapshot(),
    );

    const transcript = await buildMeetingTranscript(studio, { session_id: `ses_${SES}` });
    expect(transcript).toBeTruthy();
    expect(transcript?.messages).toHaveLength(1);
    expect(transcript?.messages[0]?.text).toBe("Need the latency study.");
    expect(JSON.stringify(transcript)).not.toContain("should not appear");
    expect(transcript?.up_to_seq).toBe(4);
    expect(transcript?.since_seq).toBe(0);
  });

  test("since_seq excludes earlier saids", async () => {
    const studio = new MemoryStudioPersistence();
    await seedJournal(
      studio,
      [
        row({
          entry_id: "evt_said1",
          type: JOURNAL_EVENT_TYPES.MEETING_SAID,
          meeting_seq: 2,
          payload: {
            message_id: MSG1,
            from: { participant_id: DESIGNER, space_id: APP, persona: "designer" },
            to: { participant_ids: [QA] },
            text: "first",
          },
        }),
        row({
          entry_id: "evt_said2",
          type: JOURNAL_EVENT_TYPES.MEETING_SAID,
          meeting_seq: 5,
          payload: {
            message_id: MSG2,
            from: { participant_id: QA, space_id: APP, persona: "qa" },
            to: { participant_ids: [DESIGNER] },
            text: "second",
          },
        }),
      ],
      snapshot(),
    );

    const transcript = await buildMeetingTranscript(studio, { session_id: SES, since_seq: 2 });
    expect(transcript?.since_seq).toBe(2);
    expect(transcript?.messages.map((m) => m.text)).toEqual(["second"]);
    expect(transcript?.messages[0]?.seq).toBe(5);
  });

  test("authored all:true projects roster minus speaker", async () => {
    const studio = new MemoryStudioPersistence();
    await seedJournal(
      studio,
      [
        row({
          entry_id: "evt_said",
          type: JOURNAL_EVENT_TYPES.MEETING_SAID,
          meeting_seq: 2,
          payload: {
            message_id: MSG1,
            from: { participant_id: DESIGNER, space_id: APP, persona: "designer" },
            to: { all: true },
            text: "hello everyone",
          },
        }),
      ],
      snapshot(),
    );

    const transcript = await buildMeetingTranscript(studio, { session_id: SES });
    expect(transcript?.messages[0]?.to).toEqual({
      all: true,
      participant_ids: [QA, RESEARCHER],
    });
  });

  test("attaches delivered and failed receipts", async () => {
    const studio = new MemoryStudioPersistence();
    await seedJournal(
      studio,
      [
        row({
          entry_id: "evt_said",
          type: JOURNAL_EVENT_TYPES.MEETING_SAID,
          meeting_seq: 2,
          payload: {
            message_id: MSG1,
            from: { participant_id: DESIGNER, space_id: APP, persona: "designer" },
            to: { all: true },
            text: "ping",
          },
        }),
        row({
          entry_id: "evt_ok",
          type: JOURNAL_EVENT_TYPES.MEETING_DELIVERED,
          meeting_seq: 3,
          payload: { message_id: MSG1, participant_id: QA },
        }),
        row({
          entry_id: "evt_fail",
          type: JOURNAL_EVENT_TYPES.MEETING_DELIVERY_FAILED,
          meeting_seq: 4,
          payload: { message_id: MSG1, participant_id: RESEARCHER, reason: "NO_HANDLER" },
        }),
      ],
      snapshot(),
    );

    const transcript = await buildMeetingTranscript(studio, { session_id: SES });
    expect(transcript?.messages[0]?.receipts).toEqual([
      {
        participant_id: QA,
        status: "delivered",
        recorded_at: "2026-08-17T00:00:00.000Z",
        latency_ms: 0,
      },
      {
        participant_id: RESEARCHER,
        status: "failed",
        reason: "NO_HANDLER",
        recorded_at: "2026-08-17T00:00:00.000Z",
        latency_ms: 0,
      },
    ]);
  });

  test("rebuilds roster and status from journal when snapshot is missing", async () => {
    const studio = new MemoryStudioPersistence();
    await seedJournal(studio, [
      row({
        entry_id: "evt_convene",
        type: JOURNAL_EVENT_TYPES.MEETING_CONVENED,
        meeting_seq: 1,
        payload: { title: "API shape", roster, chair: { human: true } },
      }),
      row({
        entry_id: "evt_said",
        type: JOURNAL_EVENT_TYPES.MEETING_SAID,
        meeting_seq: 2,
        payload: {
          message_id: MSG1,
          from: { participant_id: DESIGNER, space_id: APP, persona: "designer" },
          to: { participant_ids: [QA] },
          text: "rebuilt",
        },
      }),
      row({
        entry_id: "evt_closed",
        type: JOURNAL_EVENT_TYPES.MEETING_CLOSED,
        meeting_seq: 3,
        payload: { reason: "done" },
      }),
    ]);

    expect(await studio.getMeetingBySession(SES)).toBeNull();
    const transcript = await buildMeetingTranscript(studio, { session_id: `ses_${SES}` });
    expect(transcript?.status).toBe("closed");
    expect(transcript?.chair).toEqual({ human: true });
    expect(transcript?.roster).toHaveLength(3);
    expect(transcript?.messages[0]?.text).toBe("rebuilt");
    expect(transcript?.up_to_seq).toBe(3);
  });

  test("no meeting journal or snapshot → null", async () => {
    const studio = new MemoryStudioPersistence();
    expect(await buildMeetingTranscript(studio, { session_id: SES })).toBeNull();
  });
});
