import { afterEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { MemoryStudioPersistence } from "../src/memory.js";
import { createSqliteStudioPersistence } from "../src/sqlite.js";
import type { MemoryBankGrantRow, StudioPersistencePort } from "../src/port.js";

function grant(id: string, reader: string, bank: string, owner: string): MemoryBankGrantRow {
  return {
    grant_id: id,
    reader_space_id: reader,
    target_bank: bank,
    owner_space_id: owner,
    status: "active",
    created_at: "2026-09-13T00:00:00.000Z",
  };
}

async function runParity(persistence: StudioPersistencePort) {
  await persistence.insertMemoryBankGrant(grant("mbg_1", "reader1", "kb", "owner1"));
  await persistence.insertMemoryBankGrant(grant("mbg_2", "reader1", "doctrine", "owner2"));
  await persistence.insertMemoryBankGrant(grant("mbg_3", "reader2", "kb", "owner1"));

  expect((await persistence.listMemoryBankGrantsByReader("spc_reader1")).map((row) => row.grant_id)).toEqual([
    "mbg_1",
    "mbg_2",
  ]);
  expect((await persistence.listMemoryBankGrantsByBank("kb")).map((row) => row.grant_id)).toEqual([
    "mbg_1",
    "mbg_3",
  ]);
  expect((await persistence.listMemoryBankGrantsByOwner("spc_owner1")).map((row) => row.grant_id)).toEqual([
    "mbg_1",
    "mbg_3",
  ]);

  await persistence.revokeMemoryBankGrant("mbg_1", "2026-09-13T00:01:00.000Z");
  expect((await persistence.getMemoryBankGrant("mbg_1"))?.status).toBe("revoked");
  expect((await persistence.listMemoryBankGrantsByReader("reader1")).map((row) => row.grant_id)).toEqual([
    "mbg_2",
  ]);
}

describe("memory_bank_grants persistence", () => {
  test("insert / listByReader / listByBank / revoke", async () => {
    await runParity(new MemoryStudioPersistence());
  });

  describe("sqlite", () => {
    let db: Database.Database;

    afterEach(() => {
      db?.close();
    });

    test("insert / listByReader / listByBank / revoke", async () => {
      db = new Database(":memory:");
      await runParity(createSqliteStudioPersistence(db));
    });
  });
});

