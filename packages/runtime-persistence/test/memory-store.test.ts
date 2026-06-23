import { test, expect } from "vitest";
import { InMemoryPersistence } from "@runtime/persistence";

test("outbox row created on journal append", async () => {
  const store = new InMemoryPersistence();
  await store.runInTransaction(async (tx) => {
    const alloc = await tx.appendJournal({
      entry_id: "e1",
      kind: "command",
      outcome: "success",
      scope_id: "s",
      actor_id: "a",
      credential_id: "c",
      ts: "t",
      type: "test",
      payload: {},
    });
    await tx.insertOutbox(alloc.seq);
  });
  const state = store.getState();
  expect(state.outbox.has(1)).toBe(true);
});

test("claimFanoutBatch and ackFanout", async () => {
  const store = new InMemoryPersistence();
  await store.runInTransaction(async (tx) => {
    const alloc = await tx.appendJournal({
      entry_id: "e1",
      kind: "command",
      outcome: "success",
      scope_id: "s",
      actor_id: "a",
      credential_id: "c",
      ts: "t",
      type: "test",
      payload: {},
    });
    await tx.insertOutbox(alloc.seq);
  });
  const batch = await store.claimFanoutBatch(10, "worker-1", 30_000);
  expect(batch).toHaveLength(1);
  await store.ackFanout(1);
  const row = store.getState().outbox.get(1);
  expect(row?.processed_at).not.toBeNull();
});

test("idempotency insert once only", async () => {
  const store = new InMemoryPersistence();
  const result = {
    outcome: "success" as const,
    http_semantic: 200 as const,
    code: "ok",
    body: {},
  };
  const a = await store.runInTransaction((tx) => tx.insertIdempotency("c1", result));
  const b = await store.runInTransaction((tx) => tx.insertIdempotency("c1", result));
  expect(a).toBe("inserted");
  expect(b).toBe("exists");
});
