import { afterEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { MemoryStudioPersistence } from "../src/memory.js";
import { createSqliteStudioPersistence } from "../src/sqlite.js";
import type { MeetingSessionRow, StudioPersistencePort } from "../src/port.js";

function snapshot(sessionId: string, status: "open" | "closed", conveneEntry: string): MeetingSessionRow {
  return {
    session_id: sessionId,
    status,
    title: "API shape",
    goal: "Pick an approach",
    chair: { human: true },
    roster: [
      { participant_id: "ptc_des", space_id: "spc_app", persona: "designer" },
      { participant_id: "ptc_res", space_id: "spc_research", persona: "researcher" },
    ],
    convene_entry_id: conveneEntry,
    convene_meeting_seq: 1,
    updated_at: "2026-08-17T00:00:00.000Z",
  };
}

async function runParity(persistence: StudioPersistencePort) {
  const sessionId = "room1";
  expect(await persistence.getMeetingBySession(sessionId)).toBeNull();

  const first = await persistence.upsertMeetingSnapshot(snapshot(sessionId, "open", "evt_convene1"));
  expect(first).toEqual({ ok: true });
  expect((await persistence.listOpenMeetings()).map((row) => row.session_id)).toEqual([sessionId]);
  expect((await persistence.listMeetings()).map((row) => row.session_id)).toEqual([sessionId]);
  const loaded = await persistence.getMeetingBySession(`ses_${sessionId}`);
  expect(loaded?.status).toBe("open");
  expect(loaded?.roster).toHaveLength(2);
  expect(loaded?.chair).toEqual({ human: true });

  const collision = await persistence.upsertMeetingSnapshot(snapshot(sessionId, "open", "evt_convene2"));
  expect(collision).toEqual({ ok: false, code: "MEETING_ALREADY_OPEN" });
  expect((await persistence.getMeetingBySession(sessionId))?.convene_entry_id).toBe("evt_convene1");

  const closed = await persistence.upsertMeetingSnapshot({
    ...snapshot(sessionId, "closed", "evt_convene1"),
    close_entry_id: "evt_close1",
    close_meeting_seq: 4,
    close_outcome: "completed",
    updated_at: "2026-08-17T00:01:00.000Z",
  });
  expect(closed).toEqual({ ok: true });
  expect((await persistence.getMeetingBySession(sessionId))?.status).toBe("closed");
  expect((await persistence.listOpenMeetings())).toEqual([]);
  expect((await persistence.listMeetings()).map((row) => row.status)).toEqual(["closed"]);

  const reconvene = await persistence.upsertMeetingSnapshot(snapshot(sessionId, "open", "evt_convene3"));
  expect(reconvene).toEqual({ ok: true });
  expect((await persistence.getMeetingBySession(sessionId))?.convene_entry_id).toBe("evt_convene3");

  const seq1 = await persistence.allocateMeetingSeq(sessionId);
  const seq2 = await persistence.allocateMeetingSeq(`ses_${sessionId}`);
  expect(seq1).toBe(1);
  expect(seq2).toBe(2);

  await persistence.insertJournalIndex({
    entry_id: "evt_said",
    seq: 10,
    space_id: "app",
    type: "mrmr.meeting.said",
    session_id: sessionId,
    time: "2026-08-17T00:02:00.000Z",
    payload_json: JSON.stringify({ text: "hello" }),
  });
  await persistence.insertJournalIndex({
    entry_id: "evt_other",
    seq: 11,
    space_id: "research",
    type: "mrmr.meeting.delivered",
    session_id: sessionId,
    time: "2026-08-17T00:03:00.000Z",
    payload_json: JSON.stringify({ message_id: "msg_1" }),
  });
  await persistence.insertJournalIndex({
    entry_id: "evt_noise",
    seq: 12,
    space_id: "app",
    type: "mrmr.hook.delivered",
    session_id: sessionId,
    time: "2026-08-17T00:04:00.000Z",
    payload_json: "{}",
  });
  await persistence.setJournalIndexMeetingSeq("evt_said", 2);
  await persistence.setJournalIndexMeetingSeq("evt_other", 3);

  const journal = await persistence.queryMeetingJournal({
    session_id: `ses_${sessionId}`,
    types: ["mrmr.meeting.said", "mrmr.meeting.delivered"],
    since_meeting_seq: 1,
  });
  expect(journal.map((row) => row.entry_id)).toEqual(["evt_said", "evt_other"]);
  expect(journal[0]?.meeting_seq).toBe(2);
  expect(journal[1]?.space_id).toBe("research");

  await persistence.insertArtifact({
    transfer_id: "xfr_brief",
    source_space_id: "app",
    name: "brief.md",
    digest: "sha256:brief",
    size_bytes: 12,
    hold: false,
    authorized_readers: ["spc_app"],
    expires_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-08-17T00:00:00.000Z",
  });
  await persistence.updateArtifactAuthorizedReaders("xfr_brief", ["spc_research", "spc_app"]);
  const artifact = await persistence.getArtifact("xfr_brief");
  expect(artifact?.authorized_readers).toEqual(["spc_app", "spc_research"]);
}

describe("meeting snapshot", () => {
  test("memory convene / CAS / reconvene / meeting_seq / readers", async () => {
    await runParity(new MemoryStudioPersistence());
  });

  describe("sqlite", () => {
    let db: Database.Database;

    afterEach(() => {
      db?.close();
    });

    test("sqlite convene / CAS / reconvene / meeting_seq / readers", async () => {
      db = new Database(":memory:");
      await runParity(createSqliteStudioPersistence(db));
    });
  });
});
