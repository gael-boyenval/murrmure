import { ulid } from "ulid";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import type { MemoryBankGrantRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import type { DaemonContext } from "./context.js";
import { bareSpaceId, prefixedSpaceId } from "./space-id.js";

export function toMemoryBankGrantDto(row: MemoryBankGrantRow) {
  return {
    grant_id: row.grant_id,
    reader_space_id: prefixedSpaceId(row.reader_space_id),
    target_bank: row.target_bank,
    owner_space_id: prefixedSpaceId(row.owner_space_id),
    status: row.status,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

export async function upsertMemoryBankGrant(
  studio: StudioPersistencePort,
  input: { reader_space_id: string; target_bank: string; owner_space_id: string },
): Promise<{ row: MemoryBankGrantRow; created: boolean }> {
  const reader = bareSpaceId(input.reader_space_id);
  const owner = bareSpaceId(input.owner_space_id);
  const existing = (await studio.listMemoryBankGrantsByReader(reader)).find(
    (grant) => grant.target_bank === input.target_bank && grant.status === "active",
  );
  if (existing) return { row: existing, created: false };

  const row: MemoryBankGrantRow = {
    grant_id: `mbg_${ulid()}`,
    reader_space_id: reader,
    target_bank: input.target_bank,
    owner_space_id: owner,
    status: "active",
    created_at: new Date().toISOString(),
  };
  await studio.insertMemoryBankGrant(row);
  return { row, created: true };
}

export async function syncMemoryReadersFromApply(
  studio: StudioPersistencePort,
  owner_space_id: string,
  target_bank: string | undefined,
  readers: string[] | undefined,
): Promise<{ granted: MemoryBankGrantRow[]; revoked: MemoryBankGrantRow[] }> {
  const owner = bareSpaceId(owner_space_id);
  const desired = new Set((readers ?? []).map((id) => bareSpaceId(id)));
  const existing = await studio.listMemoryBankGrantsByOwner(owner);
  const granted: MemoryBankGrantRow[] = [];
  const revoked: MemoryBankGrantRow[] = [];
  const now = new Date().toISOString();

  if (!target_bank) {
    for (const grant of existing) {
      await studio.revokeMemoryBankGrant(grant.grant_id, now);
      revoked.push({ ...grant, status: "revoked", revoked_at: now });
    }
    return { granted, revoked };
  }

  for (const reader of desired) {
    const result = await upsertMemoryBankGrant(studio, {
      reader_space_id: reader,
      target_bank,
      owner_space_id: owner,
    });
    if (result.created) granted.push(result.row);
  }

  for (const grant of existing) {
    const keep = grant.target_bank === target_bank && desired.has(grant.reader_space_id);
    if (!keep) {
      await studio.revokeMemoryBankGrant(grant.grant_id, now);
      revoked.push({ ...grant, status: "revoked", revoked_at: now });
    }
  }

  return { granted, revoked };
}

export async function appendMemoryBankAudit(
  ctx: DaemonContext,
  input: {
    space_id: string;
    actor_id: string;
    token_id: string;
    type: string;
    data: Record<string, unknown>;
  },
): Promise<void> {
  const bare = bareSpaceId(input.space_id);
  if (!bare || bare === "bootstrap") return;
  const data = { ...input.data };
  for (const key of ["content", "text", "facts", "results", "answer", "query"]) {
    delete data[key];
  }
  await ctx.handler.appendSpaceJournal({
    space_id: prefixedSpaceId(bare),
    type: input.type,
    actor_id: input.actor_id,
    token_id: input.token_id,
    data,
  });
}

export const MEMORY_BANK_GRANT_JOURNAL = {
  granted: JOURNAL_EVENT_TYPES.MEMORY_BANK_GRANTED,
  revoked: JOURNAL_EVENT_TYPES.MEMORY_BANK_REVOKED,
  accessed: JOURNAL_EVENT_TYPES.MEMORY_BANK_ACCESSED,
} as const;
