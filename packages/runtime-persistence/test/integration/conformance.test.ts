import { describe, test, expect } from "vitest";
import { InMemoryPersistence, SqlitePersistence } from "../../src/index.js";
import { journalFingerprint, runLinearHappyPath } from "./conformance-helpers.js";

describe("memory vs sqlite conformance", () => {
  test("linear happy path on memory", async () => {
    const persistence = new InMemoryPersistence();
    const { create, transition, journal, snap } = await runLinearHappyPath(persistence);
    expect(create.outcome).toBe("success");
    expect(transition.outcome).toBe("success");
    expect(journal).toHaveLength(2);
    expect(snap?.state).toBe("running");
    expect(snap?.revision).toBe(1);
  });

  test("linear happy path on sqlite", async () => {
    const persistence = new SqlitePersistence(":memory:");
    const { create, transition, journal, snap } = await runLinearHappyPath(persistence);
    expect(create.outcome).toBe("success");
    expect(transition.outcome).toBe("success");
    expect(journal).toHaveLength(2);
    expect(snap?.state).toBe("running");
    expect(snap?.revision).toBe(1);
    await persistence.close();
  });

  test("memory and sqlite produce identical journal shapes", async () => {
    const memory = await runLinearHappyPath(new InMemoryPersistence());
    const sqlite = await runLinearHappyPath(new SqlitePersistence(":memory:"));
    expect(journalFingerprint(memory.journal)).toBe(journalFingerprint(sqlite.journal));
    expect(memory.snap?.state).toBe(sqlite.snap?.state);
    expect(memory.snap?.revision).toBe(sqlite.snap?.revision);
  });
});
