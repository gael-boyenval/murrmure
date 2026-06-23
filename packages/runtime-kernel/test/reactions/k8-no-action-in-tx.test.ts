import { describe, test, expect } from "vitest";
import type { ActionPort, PersistencePort } from "@runtime/contracts";
import { dispatchFanout } from "../../src/fanout/dispatch.js";
import { InMemoryPersistence } from "@runtime/persistence";

describe("K8: no ActionPort inside journal TX", () => {
  test("ActionPort.invoke not called during runInTransaction", async () => {
    const persistence = new InMemoryPersistence();
    let invokeDuringTx = false;

    const action: ActionPort = {
      invoke: async () => {
        return { outcome: "success" };
      },
    };

    const origRun = persistence.runInTransaction.bind(persistence);
    persistence.runInTransaction = async function <T>(fn: (tx: import("@runtime/contracts").Transaction) => Promise<T>) {
      const wrappedAction: ActionPort = {
        invoke: async (...args) => {
          invokeDuringTx = true;
          return action.invoke(...args);
        },
      };
      return origRun(fn);
    };

    await persistence.runInTransaction(async (tx) => {
      const alloc = await tx.appendJournal({
        entry_id: "e1",
        kind: "command",
        outcome: "success",
        scope_id: "scp",
        aggregate_id: "agg",
        actor_id: "a",
        credential_id: "c",
        ts: "2026-06-20T12:00:00.000Z",
        type: "transition.applied",
        payload: { status: "active", revision: 1 },
      });
      await tx.insertOutbox(alloc.seq);
      await tx.insertReaction({
        reaction_id: "rx1",
        scope_id: "scp",
        registered_at_seq: 0,
        filter: { entry_types: ["transition.applied"] },
        action: { type: "record", config: {} },
        dedup: { required: false, key_extractor: "entry_id", window_seconds: 60 },
        partition: { key: "scope" },
        enabled: true,
      });
    });

    const entries = await persistence.tailJournal(0);
    await dispatchFanout(entries, undefined, false, undefined, {
      persistence,
      notify: { resolveWait: async () => {} },
      action,
      projectionHandlers: new Map(),
      compoundProgress: new Map(),
      ids: { ulid: () => "01JQUEUE0000000001" },
    });

    expect(invokeDuringTx).toBe(false);
  });
});
