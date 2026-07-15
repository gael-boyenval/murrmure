import { test, expect } from "vitest";
import * as fc from "fast-check";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import { foldJournalToSnapshot, ENTRY_TYPES } from "@murrmure/runtime-contracts";
import type { JournalEntry } from "@murrmure/runtime-contracts";
import { checkpointFromTransition } from "../../src/checkpoint/lifecycle.js";
import type { Checkpoint } from "@murrmure/runtime-contracts";
import { matchesWaitCondition } from "../../src/waiters/match.js";
import { dedupFingerprint } from "../../src/reactions/matcher.js";
import type { ReactionSpec } from "@murrmure/runtime-contracts";

test("journal seq is strictly monotonic", async () => {
  const store = new InMemoryPersistence();
  for (let i = 0; i < 10; i++) {
    await store.runInTransaction(async (tx) => {
      await tx.appendJournal({
        entry_id: `e-${i}`,
        kind: "command",
        outcome: "success",
        scope_id: "s",
        actor_id: "a",
        credential_id: "c",
        ts: new Date().toISOString(),
        type: "test",
        payload: {},
      });
      await tx.insertOutbox(i + 1);
    });
  }
  const journal = await store.tailJournal(0);
  for (let i = 1; i < journal.length; i++) {
    expect(journal[i]!.seq).toBeGreaterThan(journal[i - 1]!.seq);
  }
});

test("property: fold is deterministic", () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom("idle", "running", "done"), { minLength: 1, maxLength: 5 }), (states) => {
      const base: JournalEntry = {
        seq: 1,
        entry_id: "e1",
        kind: "command",
        outcome: "success",
        scope_id: "s",
        aggregate_id: "agg",
        actor_id: "a",
        credential_id: "c",
        ts: "t",
        type: ENTRY_TYPES.AGGREGATE_CREATED,
        payload: {
          rule_ref: { rule_ref_id: "r", digest: "d", version: "1" },
          initial_state: "idle",
          status: "active",
          metadata: {},
          revision: 0,
        },
      };
      const entries: JournalEntry[] = [base];
      let rev = 0;
      states.forEach((st, i) => {
        rev += 1;
        entries.push({
          ...base,
          seq: i + 2,
          entry_id: `e${i + 2}`,
          type: ENTRY_TYPES.TRANSITION_APPLIED,
          payload: { to: st, status: "active", revision: rev },
        });
      });
      expect(foldJournalToSnapshot(entries, "agg")).toEqual(foldJournalToSnapshot(entries, "agg"));
    }),
  );
});

test("dedup fingerprint is stable", () => {
  const reaction: ReactionSpec = {
    reaction_id: "r1",
    scope_id: "s",
    registered_at_seq: 0,
    filter: {},
    action: { type: "record", config: {} },
    dedup: { required: true, key_extractor: "entry_id", window_seconds: 60 },
    partition: { key: "scope" },
    enabled: true,
  };
  const entry: JournalEntry = {
    seq: 1,
    entry_id: "abc",
    kind: "command",
    outcome: "success",
    scope_id: "s",
    actor_id: "a",
    credential_id: "c",
    ts: "t",
    type: "transition.applied",
    payload: { event: "start" },
  };
  expect(dedupFingerprint(reaction, entry)).toBe(dedupFingerprint(reaction, entry));
});

test("checkpoint from transition is pending with declared quorum", () => {
  const cp: Checkpoint = checkpointFromTransition(
    "c",
    "s",
    "a",
    { id: "t", from: "x", to: "y", checkpoint: { quorum: "any", count: 1, assignees: ["h"] } },
    "t",
  );
  expect(cp.status).toBe("pending");
  expect(cp.quorum).toEqual({ mode: "any", count: 1, assignees: ["h"] });
  expect(cp.votes).toEqual([]);
  expect(cp.from_state).toBe("x");
  expect(cp.to_state).toBe("y");
});
