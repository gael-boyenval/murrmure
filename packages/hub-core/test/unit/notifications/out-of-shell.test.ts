import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import {
  planOutOfShellDispatches,
  shouldDispatchOutOfShell,
  buildMurrmureDeepLink,
  GateEmailRateLimiter,
  createNoopEmailAdapter,
} from "@murrmure/hub-core";

describe("notifications/out-of-shell", () => {
  test("gate pending sends desktop payload for assignee", () => {
    const plans = planOutOfShellDispatches({
      event_type: JOURNAL_EVENT_TYPES.GATE_PENDING,
      space_id: "spc_demo",
      session_id: "ses_1",
      run_id: "run_1",
      actor_id: "actor_creator",
      data: { gate_id: "chk_gate1", assignees: ["actor_alice"], action_name: "Review" },
      grants: [],
      space_name: "Demo",
      get_prefs: () => ({ notify_email: true, notify_desktop: true }),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]?.actor_id).toBe("actor_alice");
    expect(plans[0]?.desktop?.kind).toBe("gate");
    expect(plans[0]?.desktop?.deep_link).toBe(buildMurrmureDeepLink({ run_id: "run_1", gate_id: "chk_gate1" }));
    expect(plans[0]?.desktop?.title).toContain("Review");
  });

  test("run failed notifies watchers and gate:resolve holders", () => {
    const plans = planOutOfShellDispatches({
      event_type: JOURNAL_EVENT_TYPES.RUN_FAILED,
      space_id: "spc_demo",
      session_id: "ses_1",
      run_id: "run_fail",
      data: {},
      grants: [
        { grant_id: "g1", space_id: "demo", actor_id: "actor_resolver", scopes: ["gate:resolve"], status: "active" },
      ],
      session_actor_id: "actor_session",
      created_by: { type: "actor", actor_id: "actor_creator" },
      get_prefs: () => ({ notify_email: true, notify_desktop: true }),
    });

    const actors = plans.map((p) => p.actor_id).sort();
    expect(actors).toEqual(["actor_creator", "actor_resolver", "actor_session"].sort());
    expect(plans.every((p) => p.desktop?.kind === "run_failed")).toBe(true);
  });

  test("action.completed does NOT notify", () => {
    expect(shouldDispatchOutOfShell(JOURNAL_EVENT_TYPES.ACTION_COMPLETED)).toBe(false);
    const plans = planOutOfShellDispatches({
      event_type: JOURNAL_EVENT_TYPES.ACTION_COMPLETED,
      space_id: "spc_demo",
      run_id: "run_1",
      data: {},
      grants: [],
      get_prefs: () => ({ notify_email: true, notify_desktop: true }),
    });
    expect(plans).toHaveLength(0);
  });

  test("user opt-out respected for desktop and email", () => {
    const plans = planOutOfShellDispatches({
      event_type: JOURNAL_EVENT_TYPES.GATE_PENDING,
      space_id: "spc_demo",
      run_id: "run_1",
      data: { gate_id: "chk_gate1", assignees: ["actor_alice"] },
      grants: [],
      get_prefs: () => ({ notify_email: false, notify_desktop: false }),
    });
    expect(plans).toHaveLength(0);
  });

  test("email rate limiter allows one send per gate per 15 minutes", () => {
    const limiter = new GateEmailRateLimiter();
    expect(limiter.canSend("gate1", 0)).toBe(true);
    limiter.record("gate1", 0);
    expect(limiter.canSend("gate1", 1000)).toBe(false);
    expect(limiter.canSend("gate1", 15 * 60 * 1000)).toBe(true);
  });

  test("noop email adapter logs without throwing", async () => {
    const log = vi.fn();
    const adapter = createNoopEmailAdapter({ info: log });
    await adapter.send({
      to_actor_id: "actor_alice",
      subject: "Test",
      body_text: "Hello",
    });
    expect(log).toHaveBeenCalled();
  });
});
