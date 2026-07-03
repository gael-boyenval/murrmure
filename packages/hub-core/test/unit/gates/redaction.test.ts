import { describe, expect, test } from "vitest";
import { sanitizeGateContext, shouldNotifyActor } from "@murrmure/hub-core";

describe("gates/redaction", () => {
  test("suppresses notification for non-assignee on hidden space", () => {
    expect(
      shouldNotifyActor({
        actor_id: "actor_bob",
        assignees: ["actor_alice"],
        can_read_space: false,
        space_id: "spc_secret",
      }),
    ).toBe(false);
  });

  test("shows sanitized context for assignee on hidden space", () => {
    const ctx = sanitizeGateContext({
      actor_id: "actor_alice",
      assignees: ["actor_alice"],
      can_read_space: false,
      space_id: "spc_secret",
      action_name: "review_url",
    });
    expect(ctx.visible).toBe(true);
    expect(ctx.space_hidden).toBe(true);
    expect(ctx.space_label).toBe("Private space");
    expect(ctx.space_link).toBeUndefined();
    expect(ctx.action_name).toBe("review_url");
  });

  test("shows full context when actor can read space", () => {
    const ctx = sanitizeGateContext({
      actor_id: "actor_alice",
      can_read_space: true,
      space_id: "spc_demo",
      space_name: "Demo",
    });
    expect(ctx.space_label).toBe("Demo");
    expect(ctx.space_link).toBe("/spaces/spc_demo");
  });
});
