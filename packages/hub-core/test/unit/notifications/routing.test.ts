import { describe, expect, test } from "vitest";
import {
  buildGateNotificationDrafts,
  buildRunFailedNotificationDraft,
  resolveGateNotificationRecipients,
} from "@murrmure/hub-core";

describe("notifications/routing", () => {
  test("routes to assignees first", () => {
    const recipients = resolveGateNotificationRecipients({
      assignees: ["actor_alice"],
      grants: [{ grant_id: "g1", space_id: "demo", actor_id: "actor_bob", scopes: ["flow:run"], status: "active" }],
    });
    expect(recipients).toEqual(["actor_alice"]);
  });

  test("falls back to flow:run grant holders", () => {
    const recipients = resolveGateNotificationRecipients({
      grants: [
        { grant_id: "g1", space_id: "demo", actor_id: "actor_bob", scopes: ["flow:run"], status: "active" },
        { grant_id: "g2", space_id: "demo", actor_id: "actor_carol", scopes: ["space:read"], status: "active" },
      ],
    });
    expect(recipients).toEqual(["actor_bob"]);
  });

  test("buildGateNotificationDrafts skips hidden non-assignee", () => {
    const drafts = buildGateNotificationDrafts({
      notification_id: () => "ntf_1",
      now: new Date().toISOString(),
      gate_id: "chk_gate1",
      run_id: "run_1",
      session_id: "ses_1",
      space_id: "spc_hidden",
      assignees: ["actor_alice"],
      grants: [],
      can_read_space: () => false,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.actor_id).toBe("actor_alice");
    expect(drafts[0]?.space_hidden).toBe(true);
  });

  test("buildRunFailedNotificationDraft returns null when actor cannot read space", () => {
    const draft = buildRunFailedNotificationDraft({
      notification_id: () => "ntf_1",
      now: new Date().toISOString(),
      run_id: "run_1",
      session_id: "ses_1",
      space_id: "spc_demo",
      actor_id: "actor_bob",
      can_read_space: false,
    });
    expect(draft).toBeNull();
  });

  test("buildRunFailedNotificationDraft creates pending run_failed notification", () => {
    const draft = buildRunFailedNotificationDraft({
      notification_id: () => "ntf_1",
      now: new Date().toISOString(),
      run_id: "run_1",
      session_id: "ses_1",
      space_id: "spc_demo",
      space_name: "Demo",
      actor_id: "actor_alice",
      can_read_space: true,
    });
    expect(draft?.kind).toBe("run_failed");
    expect(draft?.title).toBe("Run failed");
    expect(draft?.summary).toBe("Demo");
  });
});
