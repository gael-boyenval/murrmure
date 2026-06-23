import { describe, expect, test } from "vitest";
import { makeHub, mintActorToken } from "./helpers.js";
import { addTokenId } from "../../src/index.js";

describe("hub queries", () => {
  test("space.get returns created space", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);
    const created = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "query-test",
    });
    const spaceId = created.body.space_id as string;
    const got = await hub.handler.query("space.get", { space_id: spaceId });
    expect(got).toMatchObject({ slug: "query-test", space_id: spaceId });
  });

  test("instance.list returns instances", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);
    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "list-test",
    });
    const spaceId = space.body.space_id as string;
    await hub.handler.execute({
      kind: "instance.create",
      provenance: { space_id: spaceId, actor_id: "actor_dev", token_id: bootstrapTok },
      contract_ref_id: "cref_linear_demo",
    });
    const list = (await hub.handler.query("instance.list", { space_id: spaceId })) as unknown[];
    expect(list.length).toBe(1);
  });

  test("instance.metadata.patch increments revision", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);
    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "patch-test",
    });
    const spaceId = space.body.space_id as string;
    const inst = await hub.handler.execute({
      kind: "instance.create",
      provenance: { space_id: spaceId, actor_id: "actor_dev", token_id: bootstrapTok },
      contract_ref_id: "cref_linear_demo",
      metadata: { title: "before" },
    });
    const instanceId = inst.body.instance_id as string;
    const patch = await hub.handler.execute({
      kind: "instance.metadata.patch",
      provenance: {
        space_id: spaceId,
        instance_id: instanceId,
        actor_id: "actor_dev",
        token_id: bootstrapTok,
      },
      patch: { title: "after" },
      expected_revision: 0,
    });
    expect(patch.outcome).toBe("success");
    expect(patch.body.revision).toBe(1);
  });
});
