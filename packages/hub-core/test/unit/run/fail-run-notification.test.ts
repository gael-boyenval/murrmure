import { describe, expect, test, vi } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { failRunWithNotification } from "../../../src/run/service.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

describe("failRunWithNotification", () => {
  test("creates run_failed notification and journals RUN_FAILED", async () => {
    const studio = new MemoryStudioPersistence();
    const now = "2026-06-30T12:00:00.000Z";
    const journalAppend = vi.fn(async () => ({ seq: 1, entry_id: "evt_1" }));
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    await studio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      now,
    );
    await studio.insertSession(
      {
        session_id: "ses1",
        title: "Test session",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: ["demo"],
        actor_id: "actor_alice",
      },
      now,
    );
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: null,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: now,
      },
      now,
    );

    const result = await failRunWithNotification(
      {
        studio,
        handler,
        ids: { ulid: () => "ntf_run_fail_1" },
        clock: { nowIso: () => now },
      },
      {
        run_id: "run_run1",
        actor_id: "actor_alice",
        token_id: "tok_1",
        reason: "invoke_failed",
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.run?.lifecycle).toBe("failed");

    const notifications = await studio.listNotifications("actor_alice", { status: "pending" });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.kind).toBe("run_failed");
    expect(notifications[0]?.run_id).toBe("run1");

    expect(journalAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "mrmr.run.failed",
        run_id: "run_run1",
      }),
    );
  });
});
