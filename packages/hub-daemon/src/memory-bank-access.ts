import { MURRMURE_DENIAL_CODES, type MemoryBankListItem, type Space } from "@murrmure/contracts";
import type { MemoryBankGrantRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { prefixedSpaceId } from "./space-id.js";
import { bareSpaceId } from "./space-id.js";

export type MemoryBankDecision = "allowed" | "denied";

export type BankAccessOk = {
  ok: true;
  bank: string;
  own: boolean;
  decision: "allowed";
  grant_id?: string;
  owner_space_id?: string;
};

export type BankAccessDenied = {
  ok: false;
  code: typeof MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN | typeof MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED;
  message: string;
  capability: "memory:read" | "memory:write";
  bank: string;
  decision: "denied";
};

export type BankAccessResult = BankAccessOk | BankAccessDenied;

function spaceOwnsBank(spaces: Space[], bank: string): Space | undefined {
  return spaces.find((space) => space.memory_bank?.trim() === bank);
}

function grantForBank(grants: MemoryBankGrantRow[], bank: string): MemoryBankGrantRow | undefined {
  return grants.find((grant) => grant.target_bank === bank && grant.status === "active");
}

export async function resolveReadableBanks(
  studio: StudioPersistencePort,
  space: Space | null,
): Promise<MemoryBankListItem[]> {
  if (!space) return [];
  const ownBank = space.memory_bank?.trim();
  const grants = await studio.listMemoryBankGrantsByReader(bareSpaceId(space.space_id));
  const out: MemoryBankListItem[] = [];
  const seen = new Set<string>();

  if (ownBank) {
    seen.add(ownBank);
    out.push({
      bank: ownBank,
      origin: "own",
      owner_space_id: prefixedSpaceId(space.space_id),
    });
  }

  for (const grant of grants) {
    if (seen.has(grant.target_bank)) continue;
    seen.add(grant.target_bank);
    out.push({
      bank: grant.target_bank,
      origin: "granted",
      owner_space_id: prefixedSpaceId(grant.owner_space_id),
      grant_id: grant.grant_id,
    });
  }

  out.sort((a, b) => a.bank.localeCompare(b.bank));
  return out;
}

export async function assertBankRead(
  studio: StudioPersistencePort,
  space: Space | null,
  requestedBank: string,
): Promise<BankAccessResult> {
  const ownBank = space?.memory_bank?.trim() ?? "";
  const requested = requestedBank.trim();
  const target = requested || ownBank;

  if (!target) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN,
      message: "This space has no memory_bank — set it in space.yaml and apply",
      capability: "memory:read",
      bank: requested,
      decision: "denied",
    };
  }

  if (target === ownBank) {
    return { ok: true, bank: ownBank, own: true, decision: "allowed" };
  }

  const spaces = await studio.listSpaces();
  const owner = spaceOwnsBank(spaces, target);
  if (!owner) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN,
      message: `Bank "${target}" is not owned by any active space`,
      capability: "memory:read",
      bank: target,
      decision: "denied",
    };
  }

  if (!space) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
      message: `Bank "${target}" is outside this space's granted memory banks`,
      capability: "memory:read",
      bank: target,
      decision: "denied",
    };
  }

  const grants = await studio.listMemoryBankGrantsByReader(bareSpaceId(space.space_id));
  const grant = grantForBank(grants, target);
  if (!grant) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
      message: `Bank "${target}" is outside this space's granted memory banks`,
      capability: "memory:read",
      bank: target,
      decision: "denied",
    };
  }

  return {
    ok: true,
    bank: target,
    own: false,
    decision: "allowed",
    grant_id: grant.grant_id,
    owner_space_id: grant.owner_space_id,
  };
}

export async function assertBankWrite(
  studio: StudioPersistencePort,
  space: Space | null,
  requestedBank: string,
): Promise<BankAccessResult> {
  const ownBank = space?.memory_bank?.trim() ?? "";
  const requested = requestedBank.trim();
  const target = requested || ownBank;

  if (!ownBank) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN,
      message: "This space has no memory_bank — set it in space.yaml and apply",
      capability: "memory:write",
      bank: requested,
      decision: "denied",
    };
  }

  if (!target || target === ownBank) {
    return { ok: true, bank: ownBank, own: true, decision: "allowed" };
  }

  const spaces = await studio.listSpaces();
  const owner = spaceOwnsBank(spaces, target);
  if (!owner) {
    return {
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEMORY_BANK_UNKNOWN,
      message: `Bank "${target}" is not owned by any active space`,
      capability: "memory:write",
      bank: target,
      decision: "denied",
    };
  }

  return {
    ok: false,
    code: MURRMURE_DENIAL_CODES.MEMORY_GRANT_DENIED,
    message: `Bank "${target}" writes are denied; memory bank grants are read-only`,
    capability: "memory:write",
    bank: target,
    decision: "denied",
  };
}
