import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { Space } from "@murrmure/contracts";
import { assertBankRead, assertBankWrite, resolveReadableBanks } from "../../src/memory-bank-access.js";

function space(id: string, bank?: string): Space {
  return {
    space_id: id,
    slug: id,
    status: "active",
    memory_bank: bank,
  };
}

describe("memory-bank-access", () => {
  test("own bank is readable and writable; foreign write is denied", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertSpace(space("owner", "kb"), "2026-09-13T00:00:00.000Z");
    await studio.insertSpace(space("reader", "print-business"), "2026-09-13T00:00:00.000Z");

    const own = space("owner", "kb");
    expect(await assertBankRead(studio, own, "kb")).toMatchObject({ ok: true, own: true, bank: "kb" });
    expect(await assertBankWrite(studio, own, "kb")).toMatchObject({ ok: true, own: true });

    const ungranted = await assertBankRead(studio, space("reader", "print-business"), "kb");
    expect(ungranted).toMatchObject({ ok: false, code: "MEMORY_GRANT_DENIED" });

    const unknown = await assertBankRead(studio, space("reader", "print-business"), "missing");
    expect(unknown).toMatchObject({ ok: false, code: "MEMORY_BANK_UNKNOWN" });

    const write = await assertBankWrite(studio, space("reader", "print-business"), "kb");
    expect(write).toMatchObject({ ok: false, code: "MEMORY_GRANT_DENIED", capability: "memory:write" });
  });

  test("granted foreign read is allowed and listed", async () => {
    const studio = new MemoryStudioPersistence();
    await studio.insertSpace(space("owner", "kb"), "2026-09-13T00:00:00.000Z");
    await studio.insertSpace(space("reader", "print-business"), "2026-09-13T00:00:00.000Z");
    await studio.insertMemoryBankGrant({
      grant_id: "mbg_01TESTGRANT00000000000001",
      reader_space_id: "reader",
      target_bank: "kb",
      owner_space_id: "owner",
      status: "active",
      created_at: "2026-09-13T00:00:00.000Z",
    });

    const read = await assertBankRead(studio, space("reader", "print-business"), "kb");
    expect(read).toMatchObject({ ok: true, own: false, bank: "kb", grant_id: "mbg_01TESTGRANT00000000000001" });

    const write = await assertBankWrite(studio, space("reader", "print-business"), "kb");
    expect(write.ok).toBe(false);

    const listed = await resolveReadableBanks(studio, space("reader", "print-business"));
    expect(listed.map((row) => row.bank).sort()).toEqual(["kb", "print-business"]);
  });
});
