import { describe, expect, test } from "vitest";
import { JournalEntrySchema } from "../src/journal/cloudevents.js";
import { JOURNAL_EVENT_TYPES } from "../src/journal/event-types.js";

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const goldenJournalEntry = {
  specversion: "1.0" as const,
  id: `evt_${ULID}`,
  source: `/spaces/spc_${ULID}`,
  type: JOURNAL_EVENT_TYPES.RUN_STARTED,
  subject: `sessions/ses_${ULID}/runs/run_${ULID}`,
  time: "2026-06-30T12:00:00.000Z",
  datacontenttype: "application/json" as const,
  data: { lifecycle: "working" },
  seq: 42,
  space_id: `spc_${ULID}`,
  session_id: `ses_${ULID}`,
  run_id: `run_${ULID}`,
  actor_id: "actor_dev",
};

describe("CloudEvents journal conformance", () => {
  test("golden fixture from rev-1 §8.1 validates", () => {
    const parsed = JournalEntrySchema.parse(goldenJournalEntry);
    expect(parsed.specversion).toBe("1.0");
    expect(parsed.type).toBe(JOURNAL_EVENT_TYPES.RUN_STARTED);
  });

  test("missing specversion fails", () => {
    const { specversion: _removed, ...rest } = goldenJournalEntry;
    expect(JournalEntrySchema.safeParse(rest).success).toBe(false);
  });

  test("missing source fails", () => {
    const { source: _removed, ...rest } = goldenJournalEntry;
    expect(JournalEntrySchema.safeParse(rest).success).toBe(false);
  });

  test("missing type fails", () => {
    const { type: _removed, ...rest } = goldenJournalEntry;
    expect(JournalEntrySchema.safeParse(rest).success).toBe(false);
  });
});
