import { describe, expect, test } from "vitest";
import { makeHub, mintActorToken } from "../integration/helpers.js";
import { addTokenId } from "../../src/index.js";

describe("S2 grants", () => {
  test("grant mint and list", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "grants-test",
    });
    const spaceId = space.body.space_id as string;

    const mint = await hub.handler.execute({
      kind: "grant.mint",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      actor_id: "actor_editor",
      scopes: ["space:read", "state:transition"],
    });
    expect(mint.outcome).toBe("success");

    const list = await hub.handler.query("grant.list", { space_id: spaceId });
    expect((list as unknown[]).length).toBe(1);
  });
});

describe("S2 query.ask/answer", () => {
  test("in-proc ask/answer with schema strip", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "query-test",
    });
    const spaceId = space.body.space_id as string;

    await hub.handler.execute({
      kind: "query.ask",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      query_id: "q1",
      schema: { type: "object", required: ["answer"] },
      payload: { question: "status?" },
    });

    const answer = await hub.handler.execute({
      kind: "query.answer",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      query_id: "q1",
      payload: { answer: "ok" },
    });
    expect(answer.outcome).toBe("success");

    const bad = await hub.handler.execute({
      kind: "query.answer",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      query_id: "q1",
      payload: {},
    });
    expect(bad.code).toBe("query_failed");
  });
});

describe("S2 trigger.schedule", () => {
  test("registers cron trigger", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "cron-test",
    });
    const spaceId = space.body.space_id as string;

    const result = await hub.handler.execute({
      kind: "trigger.schedule",
      provenance: { space_id: spaceId, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      cron: "*/5 * * * *",
      spec: { type: "briefing" },
    });
    expect(result.outcome).toBe("success");
    expect(result.body.cron).toBe("*/5 * * * *");
  });
});
