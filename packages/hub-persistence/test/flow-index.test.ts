import { describe, expect, test, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createSqliteStudioPersistence } from "../src/sqlite.js";
import { migrateStudio } from "../src/migrate.js";
import type { SpaceIndexSnapshot } from "@murrmure/contracts";

function makeFlowRow(
  spaceId: string,
  flowId: string,
  name: string,
): SpaceIndexSnapshot["flows"][number] {
  const entry = {
    flow_id: flowId,
    origin_space_id: `spc_${spaceId}`,
    digest: `sha256:${name}`,
    name,
    start: { manual: true as const },
    step_spaces: [`spc_${spaceId}`],
    grants_required: [],
  };
  return { ...entry, payload_json: JSON.stringify(entry) };
}

describe("flow_index composite key", () => {
  let db: Database.Database;
  let persistence: ReturnType<typeof createSqliteStudioPersistence>;

  beforeEach(() => {
    db = new Database(":memory:");
    persistence = createSqliteStudioPersistence(db);
  });

  afterEach(() => {
    db.close();
  });

  test("same flow_id in different spaces does not collide", async () => {
    const flowId = "flw_flows_example";
    const spaceA = "spaceA";
    const spaceB = "spaceB";
    const now = new Date().toISOString();

    await persistence.insertSpace(
      { space_id: spaceA, slug: "a", name: "A", status: "active" },
      now,
    );
    await persistence.insertSpace(
      { space_id: spaceB, slug: "b", name: "B", status: "active" },
      now,
    );

    await persistence.replaceSpaceIndex(spaceA, {
      actions: [],
      executors: [],
      hooks: [],
      events: [],
      flows: [makeFlowRow(spaceA, flowId, "space-a-flow")],
    });
    await persistence.replaceSpaceIndex(spaceB, {
      actions: [],
      executors: [],
      hooks: [],
      events: [],
      flows: [makeFlowRow(spaceB, flowId, "space-b-flow")],
    });

    const flowsA = await persistence.listFlowIndex(spaceA);
    const flowsB = await persistence.listFlowIndex(spaceB);
    expect(flowsA).toHaveLength(1);
    expect(flowsB).toHaveLength(1);
    expect(flowsA[0]?.name).toBe("space-a-flow");
    expect(flowsB[0]?.name).toBe("space-b-flow");

    const entryA = await persistence.getFlowIndexEntry(flowId, spaceA);
    const entryB = await persistence.getFlowIndexEntry(flowId, spaceB);
    expect(entryA?.name).toBe("space-a-flow");
    expect(entryB?.name).toBe("space-b-flow");
  });

  test("migrates legacy flow_id-only primary key", async () => {
    db.close();
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE flow_index (
        flow_id TEXT PRIMARY KEY,
        origin_space_id TEXT NOT NULL,
        digest TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        view_ref_json TEXT
      );
      INSERT INTO flow_index (flow_id, origin_space_id, digest, payload_json)
      VALUES ('flw_legacy', 'legacy-space', 'sha256:legacy', '{"flow_id":"flw_legacy","name":"legacy"}');
    `);

    migrateStudio(db);
    persistence = createSqliteStudioPersistence(db);

    const tableSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'flow_index'")
      .get() as { sql: string };
    expect(tableSql.sql).toContain("PRIMARY KEY (origin_space_id, flow_id)");

    const row = db
      .prepare("SELECT payload_json FROM flow_index WHERE origin_space_id = ? AND flow_id = ?")
      .get("legacy-space", "flw_legacy") as { payload_json: string };
    expect(JSON.parse(row.payload_json).name).toBe("legacy");
  });
});
