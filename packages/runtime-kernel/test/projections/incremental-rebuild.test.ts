import { describe, test, expect } from "vitest";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import type { JournalEntry } from "@murrmure/runtime-contracts";
import { auditTailHandler, dispatchProjection, rebuildProjection } from "../../src/projections/dispatcher.js";

function entry(seq: number, type: string): JournalEntry {
  return {
    seq,
    entry_id: `e${seq}`,
    kind: "command",
    outcome: "success",
    scope_id: "scp",
    actor_id: "a",
    credential_id: "c",
    ts: "2026-06-20T12:00:00.000Z",
    type,
    payload: { n: seq },
  };
}

describe("projections", () => {
  test("incremental matches rebuild (K9)", async () => {
    const persistence = new InMemoryPersistence();
    const entries = [entry(1, "aggregate.created"), entry(2, "transition.applied")];

    for (const e of entries) {
      await dispatchProjection("audit_tail", auditTailHandler, e, persistence);
    }
    const incremental = await persistence.getProjection("audit_tail", "scp");

    await rebuildProjection("audit_tail", auditTailHandler, persistence, 1);
    const rebuilt = await persistence.getProjection("audit_tail", "scp");

    expect(incremental?.state.count).toBe(rebuilt?.state.count);
    expect((incremental?.state.entries as unknown[]).length).toBe(2);
  });

  test("idempotent apply does not double count", async () => {
    const persistence = new InMemoryPersistence();
    const e = entry(1, "aggregate.created");
    await dispatchProjection("audit_tail", auditTailHandler, e, persistence);
    await dispatchProjection("audit_tail", auditTailHandler, e, persistence);
    const proj = await persistence.getProjection("audit_tail", "scp");
    expect(proj?.state.count).toBe(1);
  });
});
