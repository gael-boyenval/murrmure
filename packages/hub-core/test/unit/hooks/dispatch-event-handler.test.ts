import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { dispatchHooksForEvent, type HookDispatchDeps } from "../../../src/hooks/dispatch.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";

const NOW = "2026-08-17T00:00:00.000Z";
const SPACE = "demo";

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

async function freshStudio(): Promise<MemoryStudioPersistence> {
  const studio = new MemoryStudioPersistence();
  await studio.insertSpace(
    { space_id: SPACE, slug: "demo", name: "Demo", status: "active" },
    NOW,
  );
  return studio;
}

async function installHooks(
  studio: MemoryStudioPersistence,
  hooks: Array<Record<string, unknown>>,
): Promise<void> {
  const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
  await studio.replaceSpaceIndex(SPACE, {
    ...emptySnapshot(),
    ...snapshot,
    hooks: hooks.map((hook) => ({
      key: String(hook.id ?? hook.name ?? "hook"),
      digest: "sha256:attach",
      payload_json: JSON.stringify(hook),
    })),
  });
}

function makeDeps(
  studio: MemoryStudioPersistence,
  invokeAction: HookDispatchDeps["invokeAction"] = async () => ({ http: 200 }),
): {
  deps: HookDispatchDeps;
  journal: Array<Record<string, unknown>>;
} {
  const journal: Array<Record<string, unknown>> = [];
  let counter = 0;
  const deps: HookDispatchDeps = {
    studio,
    handler: {
      appendSpaceJournal: vi.fn(async (entry: Record<string, unknown>) => {
        journal.push(entry);
        return { seq: journal.length, entry_id: `evt_${journal.length}` };
      }),
    } as unknown as HubHandler,
    ids: { ulid: () => `id${++counter}` },
    clock: { nowIso: () => NOW },
    guard: new SpaceConcurrencyGuard(),
    invokeAction,
  };
  return { deps, journal };
}

describe("hooks/dispatchEventHandler attach", () => {
  test("meeting + session_id attaches; createSession is not called", async () => {
    const studio = await freshStudio();
    await studio.insertSession(
      {
        session_id: "room1",
        title: "Existing room",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: [SPACE],
        actor_id: "actor_alice",
      },
      NOW,
    );
    const insertSession = studio.insertSession.bind(studio);
    const createdIds: string[] = [];
    studio.insertSession = async (row, created_at) => {
      createdIds.push(row.session_id);
      return insertSession(row, created_at);
    };

    await installHooks(studio, [
      {
        id: "meeting-designer",
        contract_keys: [],
        on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
        type: "mcp_session",
        complete: "explicit",
      },
    ]);

    const invokes: Array<Record<string, unknown>> = [];
    const { deps, journal } = makeDeps(studio, async (input) => {
      invokes.push(input);
      return { http: 200 };
    });

    const results = await dispatchHooksForEvent(
      deps,
      {
        event_id: "evt_said_1",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        source: "/spaces/spc_demo",
        session_id: "ses_room1",
        participant: "designer",
        payload: { text: "hello", participant: "designer" },
      },
      {
        actor_id: "actor_alice",
        token_id: "tok_1",
        capabilities: ["event:emit"],
      },
    );

    expect(results).toEqual([
      { outcome: "delivered", session_id: "ses_room1", run_id: "run_id1" },
    ]);
    expect(createdIds).toEqual([]);
    expect(await studio.listSessions()).toHaveLength(1);
    expect(invokes).toHaveLength(1);
    expect(invokes[0]?.session_id).toBe("ses_room1");
    expect(journal.some((row) => row.type === JOURNAL_EVENT_TYPES.SESSION_CREATED)).toBe(false);
    expect(journal.some((row) => row.type === JOURNAL_EVENT_TYPES.HOOK_DELIVERED)).toBe(true);
  });

  test("shell_spawn meeting handler notifies a live assignment instead of spawning again", async () => {
    const studio = await freshStudio();
    await studio.insertSession(
      {
        session_id: "room1",
        title: "Existing room",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: [SPACE],
        actor_id: "actor_alice",
      },
      NOW,
    );
    await installHooks(studio, [
      {
        id: "meeting-developer",
        contract_keys: [],
        on: { event: { type: "mrmr.meeting.said", participant: "developer" } },
        type: "shell_spawn",
        complete: "explicit",
        command: "cursor agent -p --force {{prompt}}",
      },
    ]);

    const invokes: Array<Record<string, unknown>> = [];
    const notify = vi.fn();
    const start = vi.fn();
    const { deps } = makeDeps(studio, async (input) => {
      invokes.push(input);
      return { http: 200 };
    });
    deps.liveAssignments = {
      findLive: async () => ({ run_id: "run_old", handler_id: "meeting-developer" }),
      start,
      notify,
      revoke: async () => undefined,
    };

    const results = await dispatchHooksForEvent(
      deps,
      {
        event_id: "evt_said_2",
        event_type: "mrmr.meeting.said",
        space_id: "spc_demo",
        source: "/spaces/spc_demo",
        session_id: "ses_room1",
        participant: "developer",
        participant_id: "ptc_dev",
        payload: { text: "hello", message_id: "msg_1", participant: "developer" },
      },
      {
        actor_id: "actor_alice",
        token_id: "tok_1",
        capabilities: ["event:emit"],
      },
    );

    expect(results[0]?.outcome).toBe("delivered");
    expect(invokes).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: "ses_room1",
        participant_id: "ptc_dev",
        message_id: "msg_1",
        handler_id: "meeting-developer",
      }),
    );
    expect(start).not.toHaveBeenCalled();
  });
});
