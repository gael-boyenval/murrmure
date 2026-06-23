import { describe, test, expect } from "vitest";
import { SqlitePersistence } from "../../src/sqlite/store.js";

describe("crash recovery", () => {
  test("outbox row survives for recovery drain", async () => {
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
        payload: {},
      });
      await tx.insertOutbox(alloc.seq);
    });

    const pending = await store.claimFanoutBatch(10, "recovery-worker", 30_000);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe("aggregate.created");

    await store.ackFanout(pending[0]!.seq);
    const after = await store.claimFanoutBatch(10, "recovery-worker", 30_000);
    expect(after).toHaveLength(0);
    await store.close();
  });

  test("transaction rollback leaves no partial journal", async () => {
    const store = new SqlitePersistence(":memory:");
    try {
      await store.runInTransaction(async (tx) => {
        await tx.appendJournal({
          entry_id: "e1",
          kind: "command",
          outcome: "success",
          scope_id: "s1",
          actor_id: "a1",
          credential_id: "c1",
          ts: "2026-06-20T12:00:00.000Z",
          type: "aggregate.created",
          payload: {},
        });
        throw new Error("crash before commit");
      });
    } catch {
      // expected
    }

    const journal = await store.tailJournal(0);
    expect(journal).toHaveLength(0);
    await store.close();
  });
});

describe("concurrent outbox claim", () => {
  test("two workers do not claim same seq twice while leased", async () => {
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
        payload: {},
      });
      await tx.insertOutbox(alloc.seq);
    });

    const w1 = await store.claimFanoutBatch(1, "worker-1", 60_000);
    const w2 = await store.claimFanoutBatch(1, "worker-2", 60_000);
    expect(w1).toHaveLength(1);
    expect(w2).toHaveLength(0);
    await store.close();
  });
});
