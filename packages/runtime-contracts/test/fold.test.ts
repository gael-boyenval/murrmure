import { test, expect } from "vitest";
import { foldJournalToSnapshot } from "../src/journal/fold.js";
import { ENTRY_TYPES } from "../src/journal/entry-types.js";
import type { JournalEntry } from "../src/types/journal-entry.js";

const artifact = {
  schema_version: "1.0" as const,
  id: "test",
  version: "1.0.0",
  initial_state: "idle",
  terminal_states: ["done"],
  metadata_schema: {},
  states: [
    { id: "idle", kind: "active" as const },
    { id: "running", kind: "active" as const },
    { id: "done", kind: "terminal" as const },
  ],
  transitions: [],
};

function entry(partial: Partial<JournalEntry> & Pick<JournalEntry, "seq" | "type">): JournalEntry {
  return {
    entry_id: `e-${partial.seq}`,
    kind: "command",
    outcome: "success",
    scope_id: "scp",
    aggregate_id: "agg-1",
    actor_id: "actor",
    credential_id: "cred",
    ts: "2026-01-01T00:00:00Z",
    payload: {},
    ...partial,
  };
}

test("fold: aggregate.created uses initial_state and revision from payload", () => {
  const entries = [
    entry({
      seq: 1,
      type: ENTRY_TYPES.AGGREGATE_CREATED,
      payload: {
        rule_ref: { rule_ref_id: "r1", digest: "d1", version: "1.0.0" },
        initial_state: "idle",
        status: "active",
        metadata: { label: "x" },
        revision: 0,
      },
    }),
  ];
  const snap = foldJournalToSnapshot(entries, "agg-1", { artifact });
  expect(snap?.state).toBe("idle");
  expect(snap?.revision).toBe(0);
});

test("fold: transition.applied reads revision from payload", () => {
  const entries = [
    entry({
      seq: 1,
      type: ENTRY_TYPES.AGGREGATE_CREATED,
      payload: {
        rule_ref: { rule_ref_id: "r1", digest: "d1", version: "1.0.0" },
        initial_state: "idle",
        status: "active",
        metadata: {},
        revision: 0,
      },
    }),
    entry({
      seq: 2,
      type: ENTRY_TYPES.TRANSITION_APPLIED,
      payload: { from: "idle", to: "running", status: "active", revision: 1 },
    }),
  ];
  const snap = foldJournalToSnapshot(entries, "agg-1", { artifact });
  expect(snap?.state).toBe("running");
  expect(snap?.revision).toBe(1);
});

test("fold: skips event.appended and checkpoint.vote", () => {
  const entries = [
    entry({
      seq: 1,
      type: ENTRY_TYPES.AGGREGATE_CREATED,
      payload: {
        rule_ref: { rule_ref_id: "r1", digest: "d1", version: "1.0.0" },
        initial_state: "idle",
        status: "active",
        metadata: {},
        revision: 0,
      },
    }),
    entry({ seq: 2, type: ENTRY_TYPES.EVENT_APPENDED, kind: "event" }),
    entry({ seq: 3, type: ENTRY_TYPES.CHECKPOINT_VOTE }),
    entry({
      seq: 4,
      type: ENTRY_TYPES.TRANSITION_APPLIED,
      payload: { to: "running", status: "active", revision: 1 },
    }),
  ];
  const snap = foldJournalToSnapshot(entries, "agg-1", { artifact });
  expect(snap?.revision).toBe(1);
});
