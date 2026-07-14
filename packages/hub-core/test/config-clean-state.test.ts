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

  test("advanced connection ACL accepts only already-applied canonical flow ids", async () => {
    const studio = new MemoryStudioPersistence();
    const ids = [
      "01ARZ3NDEKTSV4RRFFQ69G5FAA",
      "01ARZ3NDEKTSV4RRFFQ69G5FAB",
    ];
    const handler = new ConfigHandler(
      studio,
      { ulid: () => ids.shift() ?? "01ARZ3NDEKTSV4RRFFQ69G5FAC" },
      { nowIso: () => "2026-07-14T00:00:00.000Z" },
    );
    await studio.insertSpace(
      {
        space_id: "space",
        slug: "space",
        name: "Space",
        status: "active",
        install_policy: "human_only",
        preview_policy: "same_origin_only",
      },
      "2026-07-14T00:00:00.000Z",
    );
    await studio.insertFlowInstall(
      {
        install_id: "ins_review",
        space_id: "spc_space",
        flow_id: "review",
        version: "1.0.0",
        contract_ref_id: "cref_review",
        evolution_state: "live",
      },
      "2026-07-14T00:00:00.000Z",
    );
    const provenance = {
      space_id: "spc_space",
      actor_id: "act_admin",
      token_id: "tok_admin",
    };

    const accepted = await handler.mintGrant(
      "spc_space",
      {
        label: "restricted",
        scopes: ["space:read", "flow:read", "flow:run", "step:resolve"],
        flow_acl: ["review"],
      },
      provenance,
    );
    expect(accepted.outcome).toBe("success");
    const acceptedBody = accepted.body as { grant_id: string; token: string };
    await handler.revokeGrant("spc_space", acceptedBody.grant_id);
    expect(
      await studio.getToken(acceptedBody.token.replace(/^tok_/, "")),
    ).toMatchObject({ status: "revoked" });

    const rejected = await handler.mintGrant(
      "spc_space",
      {
        label: "future alias",
        scopes: ["space:read", "flow:read", "flow:run", "step:resolve"],
        flow_acl: ["future-review"],
      },
      provenance,
    );
    expect(rejected).toMatchObject({
      outcome: "denial",
      code: "unknown_flow_acl",
      http_semantic: 400,
    });
  });
});
