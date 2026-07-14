import { describe, expect, test } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { ConfigHandler } from "../src/handlers/config.js";
import { pinHubContractFixture } from "../../../test-utils/hub/contracts.js";

describe("clean-state configuration", () => {
  test("space ids are opaque and distinct from editable slugs", async () => {
    const studio = new MemoryStudioPersistence();
    const handler = new ConfigHandler(
      studio,
      { ulid: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      { nowIso: () => "2026-07-14T00:00:00.000Z" },
    );

    const result = await handler.handleSpaceCreate({
      name: "My First Space",
      slug: "my-first-space",
    });

    expect(result.body).toMatchObject({
      space_id: "spc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      name: "My First Space",
      slug: "my-first-space",
    });
    expect(result.body.space_id).not.toContain("my-first-space");
  });

  test("catalog names cannot install without an explicit bundle", async () => {
    const studio = new MemoryStudioPersistence();
    const handler = new ConfigHandler(
      studio,
      { ulid: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
      { nowIso: () => "2026-07-14T00:00:00.000Z" },
    );
    const created = await handler.handleSpaceCreate({
      name: "My First Space",
      slug: "my-first-space",
    });

    const result = await handler.installCapability(
      String(created.body.space_id),
      { flow_id: "brand-check" },
      "human",
    );

    expect(result).toMatchObject({
      outcome: "denial",
      code: "unknown_package",
      http_semantic: 404,
    });
    expect(await studio.listFlowInstalls(String(created.body.space_id))).toEqual([]);
  });

  test("test helper pins only the explicitly requested contract", async () => {
    const studio = new MemoryStudioPersistence();
    expect(await studio.getContractRef("cref_requested")).toBeNull();
    expect(await studio.getContractRef("cref_unrelated")).toBeNull();

    await pinHubContractFixture(
      studio,
      "linear-demo-v2",
      "cref_requested",
    );

    expect(await studio.getContractRef("cref_requested")).toMatchObject({
      contract_ref_id: "cref_requested",
      capability_id: "linear-demo",
    });
    expect(await studio.getContractRef("cref_unrelated")).toBeNull();
  });
});
