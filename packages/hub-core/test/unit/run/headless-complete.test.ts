import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { maybeCompleteHeadlessRun, reconcileHeadlessRuns } from "../../../src/run/service.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

describe("reconcileHeadlessRuns", () => {
  const now = "2026-07-02T14:00:00.000Z";

  test("completes run when step memo already completed", async () => {
    const studio = new MemoryStudioPersistence();
    const journalAppend = vi.fn(async () => ({ seq: 1, entry_id: "evt_1" }));
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;
    const deps = {
      studio,
      handler,
      ids: { ulid: () => "x" },
      clock: { nowIso: () => now },
    };

    await studio.insertSession(
      {
        session_id: "ses1",
        title: "Feedback",
        status: "active",
        created_by: { type: "hook", hook_id: "on-dev-improvement" },
        spaces_touched: ["demo"],
        actor_id: "actor_hook",
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
        started_at: "2026-07-02T13:26:30.579Z",
      },
      now,
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "hook:on-dev-improvement",
      status: "completed",
      completed_at: "2026-07-02T13:26:30.652Z",
    });

    const stats = await reconcileHeadlessRuns(deps);
    expect(stats.completed).toBe(1);
    expect((await studio.getRun("run1"))?.lifecycle).toBe("completed");
    expect((await studio.getSession("ses1"))?.status).toBe("completed");
  });

  test("fails stale headless dispatch stuck on working step", async () => {
    const studio = new MemoryStudioPersistence();
    const journalAppend = vi.fn(async () => ({ seq: 1, entry_id: "evt_1" }));
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;
    const deps = {
      studio,
      handler,
      ids: { ulid: () => "x" },
      clock: { nowIso: () => now },
    };

    await studio.insertSession(
      {
        session_id: "ses2",
        title: "Feedback",
        status: "active",
        created_by: { type: "hook", hook_id: "on-dev-improvement" },
        spaces_touched: ["demo"],
        actor_id: "actor_hook",
      },
      now,
    );
    await studio.insertRun(
      {
        run_id: "run2",
        session_id: "ses2",
        space_id: "demo",
        flow_id: null,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: "2026-07-02T13:00:00.000Z",
      },
      now,
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run2",
      step_id: "hook:on-dev-improvement",
      status: "working",
      started_at: "2026-07-02T13:00:00.000Z",
    });

    const stats = await reconcileHeadlessRuns(deps);
    expect(stats.stale_failed).toBe(1);
    expect((await studio.getRun("run2"))?.lifecycle).toBe("failed");
    expect(journalAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: JOURNAL_EVENT_TYPES.RUN_FAILED,
        run_id: "run_run2",
      }),
    );
  });
});

describe("maybeCompleteHeadlessRun", () => {
  test("completes headless run and session when all step memos terminal", async () => {
    const studio = new MemoryStudioPersistence();
    const now = "2026-07-02T12:00:00.000Z";
    const journalAppend = vi.fn(async () => ({ seq: 1, entry_id: "evt_1" }));
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;
    const deps = {
      studio,
      handler,
      ids: { ulid: () => "x" },
      clock: { nowIso: () => now },
    };

    await studio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      now,
    );
    await studio.insertSession(
      {
        session_id: "ses1",
        title: "Feedback",
        status: "active",
        created_by: { type: "hook", hook_id: "on-dev-improvement" },
        spaces_touched: ["demo"],
        actor_id: "actor_hook",
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
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "hook:on-dev-improvement",
      status: "completed",
      completed_at: now,
    });

    await maybeCompleteHeadlessRun(deps, { run_id: "run_run1" });

    const run = await studio.getRun("run1");
    expect(run?.lifecycle).toBe("completed");
    expect(run?.ended_at).toBe(now);

    const session = await studio.getSession("ses1");
    expect(session?.status).toBe("completed");

    expect(journalAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: JOURNAL_EVENT_TYPES.RUN_COMPLETED,
        run_id: "run_run1",
        session_id: "ses_ses1",
      }),
    );
  });
});
