import { describe, test, expect } from "vitest";
import { SqlitePersistence } from "../src/sqlite/store.js";
import type { JournalEntryDraft } from "@runtime/contracts";

describe("SqlitePersistence", () => {
  test("append journal + outbox in transaction", async () => {
    const store = new SqlitePersistence(":memory:");
    await store.runInTransaction(async (tx) => {
      const alloc = await tx.appendJournal({
        entry_id: "e1",
        kind: "command",
        outcome: "success",
        scope_id: "s1",
        actor_id: "a1",
        credential_id: "c1",
        ts: "2026-06-20T12:00:00.000Z",
        type: "aggregate.created",
        payload: { state: "idle" },
      });
      await tx.insertOutbox(alloc.seq);
    });

    const journal = await store.tailJournal(0);
    expect(journal).toHaveLength(1);
    expect(journal[0]?.seq).toBe(1);

    const batch = await store.claimFanoutBatch(10, "w1", 5000);
    expect(batch).toHaveLength(1);
    await store.ackFanout(1);
    await store.close();
  });

  test("CAS snapshot conflict", async () => {
    const store = new SqlitePersistence(":memory:");
    const draft: JournalEntryDraft = {
      entry_id: "e1",
      kind: "command",
      outcome: "success",
      scope_id: "s1",
      aggregate_id: "agg1",
      actor_id: "a1",
      credential_id: "c1",
      ts: "2026-06-20T12:00:00.000Z",
      type: "aggregate.created",
      payload: {},
    };

    await store.runInTransaction(async (tx) => {
      await tx.appendJournal(draft);
      await tx.upsertSnapshotIfRevision(
        {
          aggregate_id: "agg1",
          scope_id: "s1",
          rule_ref: { rule_ref_id: "r", digest: "d", version: "1" },
          state: "idle",
          metadata: {},
          revision: 0,
          status: "active",
          created_at: "t",
          updated_at: "t",
        },
        -1,
      );
    });

    const conflict = await store.runInTransaction(async (tx) =>
      tx.upsertSnapshotIfRevision(
        {
          aggregate_id: "agg1",
          scope_id: "s1",
          rule_ref: { rule_ref_id: "r", digest: "d", version: "1" },
          state: "running",
          metadata: {},
          revision: 1,
          status: "active",
          created_at: "t",
          updated_at: "t",
        },
        1,
      ),
    );
    expect(conflict).toBe("conflict");
    await store.close();
  });

  test("idempotency insert once only", async () => {
    const store = new SqlitePersistence(":memory:");
    const result = { outcome: "success" as const, http_semantic: 200 as const, code: "ok", body: {} };
    const first = await store.runInTransaction((tx) => tx.insertIdempotency("cmd1", result));
    const second = await store.runInTransaction((tx) => tx.insertIdempotency("cmd1", result));
    expect(first).toBe("inserted");
    expect(second).toBe("exists");
    await store.close();
  });
});
