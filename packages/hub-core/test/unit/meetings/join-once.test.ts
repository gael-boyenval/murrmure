import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import {
  dispatchHooksForEvent,
  type HookDispatchDeps,
  type LiveAssignmentPort,
  type LiveAssignmentRecord,
} from "../../../src/hooks/dispatch.js";
import { closeMeeting } from "../../../src/meetings/close.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
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
      digest: "sha256:join-once",
      payload_json: JSON.stringify(hook),
    })),
  });
}

function fakeLivePort(): {
  port: LiveAssignmentPort;
  starts: Array<Record<string, unknown>>;
  notifies: Array<Record<string, unknown>>;
  revokes: Array<Record<string, unknown>>;
} {
  const seats = new Map<string, LiveAssignmentRecord>();
  const starts: Array<Record<string, unknown>> = [];
  const notifies: Array<Record<string, unknown>> = [];
  const revokes: Array<Record<string, unknown>> = [];
  const keyOf = (session_id: string, participant?: string) =>
    `${session_id}:${participant ?? ""}`;
  const port: LiveAssignmentPort = {
    async findLive({ session_id, participant }) {
      return seats.get(keyOf(session_id, participant)) ?? null;
    },
    async start(input) {
      starts.push(input);
      seats.set(keyOf(input.session_id, input.participant_id), {
        run_id: input.run_id,
        handler_id: input.handler_id,
        principal: input.principal,
      });
    },
    async notify(input) {
      notifies.push(input);
    },
    async revoke(input) {
      revokes.push(input);
      if (input.participant_id) {
        seats.delete(keyOf(input.session_id, input.participant_id));
        return;
      }
      for (const key of [...seats.keys()]) {
        if (key.startsWith(`${input.session_id}:`)) seats.delete(key);
      }
    },
  };
  return { port, starts, notifies, revokes };
}

function makeDeps(
  studio: MemoryStudioPersistence,
  live: LiveAssignmentPort,
  invokeAction: HookDispatchDeps["invokeAction"] = async () => ({ http: 200 }),
): {
  deps: HookDispatchDeps;
  createdIds: string[];
  invokes: Array<Record<string, unknown>>;
} {
  const createdIds: string[] = [];
  const invokes: Array<Record<string, unknown>> = [];
  const insertSession = studio.insertSession.bind(studio);
  studio.insertSession = async (row, created_at) => {
    createdIds.push(row.session_id);
    return insertSession(row, created_at);
  };
  let counter = 0;
  const deps: HookDispatchDeps = {
    studio,
    handler: {
      appendSpaceJournal: vi.fn(async () => ({
        seq: ++counter,
        entry_id: `evt_${counter}`,
      })),
    } as unknown as HubHandler,
    ids: { ulid: () => `id${++counter}` },
    clock: { nowIso: () => NOW },
    guard: new SpaceConcurrencyGuard(),
    liveAssignments: live,
    invokeAction: async (input) => {
      invokes.push(input);
      return invokeAction(input);
    },
  };
  return { deps, createdIds, invokes };
}

const designerHandler = {
  id: "meeting-designer",
  contract_keys: [],
  on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
  type: "mcp_session",
  complete: "explicit",
};

const qaHandler = {
  id: "meeting-qa",
  contract_keys: [],
  on: { event: { type: "mrmr.meeting.said", participant: "qa" } },
  type: "mcp_session",
  complete: "explicit",
};

async function seedRoom(studio: MemoryStudioPersistence): Promise<void> {
  await studio.insertSession(
    {
      session_id: "room1",
      title: "Room",
      status: "active",
      created_by: { type: "actor", actor_id: "actor_alice" },
      spaces_touched: [SPACE],
      actor_id: "actor_alice",
    },
    NOW,
  );
}

function saidEvent(input: {
  event_id: string;
  participant: string;
  participant_id?: string;
  message_id: string;
}): Parameters<typeof dispatchHooksForEvent>[1] {
  return {
    event_id: input.event_id,
    event_type: "mrmr.meeting.said",
    space_id: "spc_demo",
    source: "/spaces/spc_demo",
    session_id: "ses_room1",
    participant: input.participant,
    participant_id: input.participant_id ?? `ptc_${input.participant}`,
    payload: {
      text: "hello",
      participant: input.participant,
      message_id: input.message_id,
    },
  };
}

const actor = {
  actor_id: "actor_alice",
  token_id: "tok_1",
  capabilities: ["event:emit" as const],
};

describe("meetings/join-once", () => {
  test("two said, same seat, different event_id → start×1, notify×1, invoke×1, createSession×0", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [designerHandler]);
    const live = fakeLivePort();
    const { deps, createdIds, invokes } = makeDeps(studio, live.port);

    const first = await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_said_1", participant: "designer", message_id: "msg_1" }),
      actor,
    );
    const second = await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_said_2", participant: "designer", message_id: "msg_2" }),
      actor,
    );

    expect(first[0]?.outcome).toBe("delivered");
    expect(second[0]?.outcome).toBe("delivered");
    expect(createdIds).toEqual([]);
    expect(invokes).toHaveLength(1);
    expect(live.starts).toHaveLength(1);
    expect(live.starts[0]).toMatchObject({
      session_id: "ses_room1",
      participant_id: "ptc_designer",
      handler_id: "meeting-designer",
    });
    expect(live.notifies).toHaveLength(1);
    expect(live.notifies[0]).toMatchObject({
      session_id: "ses_room1",
      participant_id: "ptc_designer",
      message_id: "msg_2",
      handler_id: "meeting-designer",
    });
    expect(await studio.listSessions()).toHaveLength(1);
  });

  test("shell_spawn seat: first said starts, later said notifies (no second spawn)", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [
      {
        ...designerHandler,
        type: "shell_spawn",
        command: "cursor agent -p --force {{prompt}}",
      },
    ]);
    const live = fakeLivePort();
    const { deps, createdIds, invokes } = makeDeps(studio, live.port);

    const first = await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_said_1", participant: "designer", message_id: "msg_1" }),
      actor,
    );
    const second = await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_said_2", participant: "designer", message_id: "msg_2" }),
      actor,
    );

    expect(first[0]?.outcome).toBe("delivered");
    expect(second[0]?.outcome).toBe("delivered");
    expect(createdIds).toEqual([]);
    expect(invokes).toHaveLength(1);
    expect(live.starts).toHaveLength(1);
    expect(live.notifies).toHaveLength(1);
    expect(live.notifies[0]).toMatchObject({
      session_id: "ses_room1",
      participant_id: "ptc_designer",
      message_id: "msg_2",
    });
  });

  test("registers shell_spawn seat before invoking the child", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [
      {
        ...designerHandler,
        type: "shell_spawn",
        command: "cursor agent -p --force {{prompt}}",
      },
    ]);
    const live = fakeLivePort();
    let liveDuringInvoke: LiveAssignmentRecord | null = null;
    const { deps } = makeDeps(studio, live.port, async () => {
      liveDuringInvoke = await live.port.findLive({
        session_id: "ses_room1",
        participant: "ptc_designer",
      });
      return { http: 200 };
    });

    await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_said_race", participant: "designer", message_id: "msg_race" }),
      actor,
    );

    expect(liveDuringInvoke).toMatchObject({
      handler_id: "meeting-designer",
    });
  });

  test("same event_id → dedup one wake", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [designerHandler]);
    const live = fakeLivePort();
    const { deps, invokes } = makeDeps(studio, live.port);
    const event = saidEvent({
      event_id: "evt_said_dup",
      participant: "designer",
      message_id: "msg_dup",
    });

    const first = await dispatchHooksForEvent(deps, event, actor);
    const second = await dispatchHooksForEvent(deps, event, actor);

    expect(first[0]?.outcome).toBe("delivered");
    expect(second).toEqual([{ outcome: "deduped", run_id: "run_id1" }]);
    expect(invokes).toHaveLength(1);
    expect(live.starts).toHaveLength(1);
    expect(live.notifies).toHaveLength(0);
  });

  test("two personas one space → two starts, notifies by seat (record handler_id)", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [designerHandler, qaHandler]);
    const live = fakeLivePort();
    const { deps, invokes } = makeDeps(studio, live.port);

    await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_d1", participant: "designer", message_id: "msg_d1" }),
      actor,
    );
    await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_q1", participant: "qa", message_id: "msg_q1" }),
      actor,
    );
    await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_d2", participant: "designer", message_id: "msg_d2" }),
      actor,
    );
    await dispatchHooksForEvent(
      deps,
      saidEvent({ event_id: "evt_q2", participant: "qa", message_id: "msg_q2" }),
      actor,
    );

    expect(live.starts).toHaveLength(2);
    expect(live.starts.map((row) => row.handler_id).sort()).toEqual([
      "meeting-designer",
      "meeting-qa",
    ]);
    expect(live.starts.map((row) => row.participant_id).sort()).toEqual([
      "ptc_designer",
      "ptc_qa",
    ]);
    expect(invokes).toHaveLength(2);
    expect(live.notifies).toHaveLength(2);
    expect(live.notifies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participant_id: "ptc_designer",
          handler_id: "meeting-designer",
          message_id: "msg_d2",
        }),
        expect.objectContaining({
          participant_id: "ptc_qa",
          handler_id: "meeting-qa",
          message_id: "msg_q2",
        }),
      ]),
    );
  });

  test("same persona on two roster seats uses participant_id, not persona, as live key", async () => {
    const studio = await freshStudio();
    await seedRoom(studio);
    await installHooks(studio, [designerHandler]);
    const live = fakeLivePort();
    const { deps, invokes } = makeDeps(studio, live.port);

    await dispatchHooksForEvent(
      deps,
      saidEvent({
        event_id: "evt_default_a",
        participant: "designer",
        participant_id: "ptc_default_a",
        message_id: "msg_default_a",
      }),
      actor,
    );
    await dispatchHooksForEvent(
      deps,
      saidEvent({
        event_id: "evt_default_b",
        participant: "designer",
        participant_id: "ptc_default_b",
        message_id: "msg_default_b",
      }),
      actor,
    );

    expect(invokes).toHaveLength(2);
    expect(live.starts.map((row) => row.participant_id)).toEqual([
      "ptc_default_a",
      "ptc_default_b",
    ]);
    expect(live.notifies).toHaveLength(0);
  });

  test("closeMeeting revokes live seats for the session", async () => {
    const studio = await freshStudio();
    await studio.replaceSpaceIndex(SPACE, {
      ...emptySnapshot(),
      personas: [
        {
          key: "designer",
          digest: "d",
          payload_json: JSON.stringify({ id: "designer", summary: "d" }),
        },
      ],
    });
    const live = fakeLivePort();
    let n = 0;
    const deps = {
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
      liveAssignments: live.port,
    };
    const room = await conveneMeeting(deps, {
      title: "Close revoke",
      participants: [{ space_id: `spc_${SPACE}`, persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const participantId = room.roster[0]!.participant_id;
    await live.port.start({
      session_id: room.session_id,
      participant_id: participantId,
      handler_id: "meeting-designer",
      run_id: "run_seat",
    });
    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(closed.ok).toBe(true);
    expect(live.revokes).toEqual([{ session_id: room.session_id }]);
    expect(
      await live.port.findLive({ session_id: room.session_id, participant: participantId }),
    ).toBeNull();
  });
});
