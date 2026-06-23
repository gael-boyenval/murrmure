import { test, expect } from "vitest";
import * as fc from "fast-check";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import { foldJournalToSnapshot, ENTRY_TYPES } from "@murrmure/runtime-contracts";
import type { JournalEntry } from "@murrmure/runtime-contracts";
import { isQuorumSatisfied, addVote } from "../../src/checkpoint/lifecycle.js";
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

test("checkpoint quorum any", () => {
  const cp: Checkpoint = {
    checkpoint_id: "c",
    aggregate_id: "a",
    scope_id: "s",
    transition_id: "t",
    from_state: "x",
    to_state: "y",
    status: "pending",
    quorum: { mode: "any", count: 1, assignees: ["h"] },
    votes: [{ actor_id: "h1", decision: "approved", ts: "t" }],
    created_at: "t",
  };
  expect(isQuorumSatisfied(cp)).toBe(true);
});
