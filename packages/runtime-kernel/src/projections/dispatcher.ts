import type { JournalEntry, PersistencePort } from "@runtime/contracts";

export type ProjectionHandler = (
  entry: JournalEntry,
  prior: Record<string, unknown> | null,
) => Record<string, unknown> | null;

export function auditTailHandler(
  entry: JournalEntry,
  prior: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const entries = ((prior?.entries as JournalEntry[]) ?? []).slice();
  entries.push({
    seq: entry.seq,
    entry_id: entry.entry_id,
    type: entry.type,
    outcome: entry.outcome,
    scope_id: entry.scope_id,
    aggregate_id: entry.aggregate_id,
    actor_id: entry.actor_id,
    credential_id: entry.credential_id,
    command_id: entry.command_id,
    ts: entry.ts,
    kind: entry.kind,
    payload: entry.payload,
  } as JournalEntry);
  return { entries, count: entries.length };
}

export async function dispatchProjection(
  name: string,
  handler: ProjectionHandler,
  entry: JournalEntry,
  persistence: PersistencePort,
): Promise<void> {
  await persistence.runInTransaction(async (tx) => {
    const applied = await tx.tryMarkProjectionApplied(name, entry.seq);
    if (!applied) return;

    const existing = await persistence.getProjection(name, entry.scope_id, entry.aggregate_id);
    const prior = existing?.state ?? null;
    const next = handler(entry, prior);
    if (next === null) return;
    await tx.upsertProjection(name, entry.scope_id, entry.aggregate_id, entry.seq, next);
  });
  await persistence.setProjectionCursor(name, entry.seq);
}

export async function rebuildProjection(
  name: string,
  handler: ProjectionHandler,
  persistence: PersistencePort,
  from_seq = 0,
  owner = "rebuild",
): Promise<void> {
  const acquired = await persistence.acquireProjectionLock(name, owner, 60_000);
  if (!acquired) throw new Error(`Projection lock held: ${name}`);

  try {
    await persistence.setProjectionCursor(name, from_seq - 1);
    const entries = await persistence.tailJournal(from_seq);
    let state: Record<string, unknown> | null = null;
    let lastSeq = 0;
    let lastScope = "";
    let lastAgg: string | undefined;

    for (const entry of entries) {
      const next = handler(entry, state);
      if (next !== null) {
        state = next;
        lastSeq = entry.seq;
        lastScope = entry.scope_id;
        lastAgg = entry.aggregate_id;
      }
    }

    if (state && lastSeq > 0) {
      await persistence.runInTransaction(async (tx) => {
        await tx.upsertProjection(name, lastScope, lastAgg, lastSeq, state!);
      });
      await persistence.setProjectionCursor(name, lastSeq);
    }
  } finally {
    await persistence.releaseProjectionLock(name, owner);
  }
}
