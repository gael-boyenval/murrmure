import { describe, expect, test } from "vitest";
import { makeHub } from "../integration/helpers.js";
import { addTokenId } from "../../src/index.js";
import { STUDIO_DENIAL_CODES } from "@studio/contracts";

describe("S3 federation", () => {
  test("ingress denied without registered hub", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "fed-test",
    });
    const spaceId = space.body.space_id as string;

    const result = await hub.handler.execute({
      kind: "federation.emit",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      target_hub_id: "hub_unknown",
      event_type: "ping",
      payload: {},
    });
    expect(result.code).toBe(STUDIO_DENIAL_CODES.FEDERATION_DENIED);
  });

  test("outbound enqueue and claim", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "fed-out",
    });
    const spaceId = space.body.space_id as string;

    await hub.studioPersistence.insertFederationHub({
      hub_id: "hub_remote",
      endpoint: "http://localhost:9999",
      status: "active",
      routing: {},
    });

    const emit = await hub.handler.execute({
      kind: "federation.emit",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      target_hub_id: "hub_remote",
      event_type: "ping",
      payload: { hello: true },
    });
    expect(emit.outcome).toBe("success");

    const batch = await hub.studioPersistence.claimFederationOutbound(10);
    expect(batch.length).toBe(1);
  });
});
