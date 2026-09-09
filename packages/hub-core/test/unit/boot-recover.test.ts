import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../src/handlers/hub.js";
import { conveneMeeting } from "../../src/meetings/convene.js";
import type { HookDispatchDeps } from "../../src/hooks/dispatch.js";
import { SpaceConcurrencyGuard } from "../../src/run/space-guard.js";
import {
  HUB_RESTART_ORPHANED,
  failOrphanedWorkingRuns,
  rehydrateOpenMeetings,
} from "../../src/boot-recover.js";

const NOW = "2026-08-17T00:00:00.000Z";
const APP = "app";

function emptySnapshot() {
  return {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    personas: [],
    flows: [],
    views: [],
    run_policies: [],
  };
}

async function seed(studio: MemoryStudioPersistence): Promise<void> {
  await studio.insertSpace({ space_id: APP, slug: "meetings-app", name: "App", status: "active" }, NOW);
  await studio.replaceSpaceIndex(APP, {
    ...emptySnapshot(),
    personas: [
      { key: "designer", digest: "d", payload_json: JSON.stringify({ id: "designer", summary: "d" }) },
    ],
    hooks: [
      {
        key: "meeting-designer",
        digest: "h",
        payload_json: JSON.stringify({
          id: "meeting-designer",
          contract_keys: [],
          on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
          type: "mcp_session",
          complete: "explicit",
        }),
      },
    ],
  });
}

function makeDeps(studio: MemoryStudioPersistence, invokes: string[] = []): HookDispatchDeps {
  let n = 0;
  return {
    studio,
    handler: {
      appendSpaceJournal: vi.fn(async () => {
        n += 1;
        return { seq: n, entry_id: `evt_${n}` };
      }),
    } as unknown as HubHandler,
    ids: { ulid: () => `id${++n}` },
    clock: { nowIso: () => NOW },
    guard: new SpaceConcurrencyGuard(),
    invokeAction: async (input) => {
      invokes.push(input.action_name);
      return { http: 200 };
    },
  };
}

describe("boot-recover", () => {
  test("rehydrateOpenMeetings respawns seats on an already-open room without journaling resumed", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const invokes: string[] = [];
    const deps = makeDeps(studio, invokes);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      goal: "Pick an approach",
      participants: [{ space_id: `spc_${APP}`, persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    expect(invokes).toEqual(["meeting-designer"]);

    const journal = deps.handler.appendSpaceJournal as ReturnType<typeof vi.fn>;
    journal.mockClear();
    invokes.length = 0;

    const result = await rehydrateOpenMeetings(deps, {
      actor_id: "actor_bootstrap",
      token_id: "tok_boot",
    });
    expect(result.rooms).toBe(1);
    expect(invokes).toEqual(["meeting-designer"]);
    expect(journal.mock.calls.some((call) => call[0]?.type === JOURNAL_EVENT_TYPES.MEETING_RESUMED)).toBe(
      false,
    );
    expect((await studio.getMeetingBySession(room.session_id))?.status).toBe("open");
  });

  test("failOrphanedWorkingRuns fails leftover working runs and skips bound meeting flow runs", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      participants: [{ space_id: `spc_${APP}`, persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const sessionBare = room.session_id.startsWith("ses_") ? room.session_id.slice(4) : room.session_id;
    await studio.insertRun(
      {
        run_id: "seat1",
        session_id: sessionBare,
        space_id: APP,
        flow_id: null,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: NOW,
      },
      NOW,
    );
    await studio.insertRun(
      {
        run_id: "flow1",
        session_id: sessionBare,
        space_id: APP,
        flow_id: "flw_room",
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: NOW,
      },
      NOW,
    );
    await studio.insertSession(
      {
        session_id: "other",
        title: "Directive",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: [APP],
        actor_id: "actor_alice",
      },
      NOW,
    );
    await studio.insertRun(
      {
        run_id: "directive1",
        session_id: "other",
        space_id: APP,
        flow_id: "flw_mrmr_directive",
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: NOW,
      },
      NOW,
    );
    await studio.insertRun(
      {
        run_id: "gate1",
        session_id: "other",
        space_id: APP,
        flow_id: "flw_preview",
        lifecycle: "input-required",
        exec_context: {},
        reference_run_ids: [],
        started_at: NOW,
      },
      NOW,
    );

    const meeting = await studio.getMeetingBySession(room.session_id);
    expect(meeting).toBeTruthy();
    if (!meeting) return;
    await studio.upsertMeetingSnapshot({
      ...meeting,
      bound_run_id: "run_flow1",
      bound_step_id: "decide",
    });

    const journal = deps.handler.appendSpaceJournal as ReturnType<typeof vi.fn>;
    journal.mockClear();

    const result = await failOrphanedWorkingRuns(deps, {
      actor_id: "actor_bootstrap",
      token_id: "tok_boot",
    });
    expect(result.skipped_bound).toBe(1);
    expect(result.failed).toBeGreaterThanOrEqual(2);
    expect((await studio.getRun("seat1"))?.lifecycle).toBe("failed");
    expect((await studio.getRun("flow1"))?.lifecycle).toBe("working");
    expect((await studio.getRun("directive1"))?.lifecycle).toBe("failed");
    expect((await studio.getRun("gate1"))?.lifecycle).toBe("input-required");

    const failedReasons = journal.mock.calls
      .filter((call) => call[0]?.type === JOURNAL_EVENT_TYPES.RUN_FAILED)
      .map((call) => call[0]?.data?.reason);
    expect(failedReasons).toEqual([HUB_RESTART_ORPHANED]);
    const pending = await studio.listNotifications("actor_alice", { status: "pending" });
    expect(pending.map((row) => row.run_id)).toEqual(["directive1"]);
  });
});
