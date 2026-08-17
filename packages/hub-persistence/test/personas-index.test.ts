import { afterEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import type { PersonaAd, SpaceIndexSnapshot } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "../src/memory.js";
import { createSqliteStudioPersistence } from "../src/sqlite.js";
import type { StudioPersistencePort } from "../src/port.js";

function emptySnapshot(personas: SpaceIndexSnapshot["personas"] = []): SpaceIndexSnapshot {
  return {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    personas,
    flows: [],
    views: [],
    run_policies: [],
  };
}

function personaRow(ad: PersonaAd, digest: string): SpaceIndexSnapshot["personas"][number] {
  return {
    key: ad.id,
    digest,
    payload_json: JSON.stringify(ad),
  };
}

async function runParity(persistence: StudioPersistencePort) {
  const spaceId = "meetings-catalog";
  const now = new Date().toISOString();
  await persistence.insertSpace(
    { space_id: spaceId, slug: "meetings-catalog", name: "Meetings", status: "active" },
    now,
  );

  const designer: PersonaAd = {
    id: "designer",
    summary: "Product design",
    asks: ["API shape"],
    requests: ["attach a brief"],
  };
  await persistence.replaceSpaceIndex(
    spaceId,
    emptySnapshot([personaRow(designer, "sha256:p1")]),
  );

  const listed = await persistence.listIndexedPersonas(spaceId);
  expect(listed).toEqual([designer]);

  const snapshot = await persistence.getSpaceIndexSnapshot(spaceId);
  expect(snapshot.personas.map((row) => row.key)).toEqual(["designer"]);

  const researcher: PersonaAd = { id: "researcher", summary: "Prior art" };
  await persistence.replaceSpaceIndex(
    spaceId,
    emptySnapshot([personaRow(researcher, "sha256:p2")]),
  );

  const afterReplace = await persistence.listIndexedPersonas(spaceId);
  expect(afterReplace).toEqual([researcher]);
  expect(afterReplace.some((row) => row.id === "designer")).toBe(false);
}

describe("personas index", () => {
  test("memory replace / list / second replace deletes old", async () => {
    await runParity(new MemoryStudioPersistence());
  });

  describe("sqlite", () => {
    let db: Database.Database;

    afterEach(() => {
      db?.close();
    });

    test("sqlite replace / list / second replace deletes old", async () => {
      db = new Database(":memory:");
      await runParity(createSqliteStudioPersistence(db));
    });
  });
});
