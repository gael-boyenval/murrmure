import { describe, expect, test, vi } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import { closeMeeting } from "../../../src/meetings/close.js";
import { resumeMeeting } from "../../../src/meetings/resume.js";
import { prepareMeetingSaid } from "../../../src/meetings/said.js";
import type { HookDispatchDeps } from "../../../src/hooks/dispatch.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";

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
      { key: "qa", digest: "q", payload_json: JSON.stringify({ id: "qa", summary: "q" }) },
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

describe("meetings/resume", () => {
  test("reopens the same session and roster, then said is allowed", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const invokes: string[] = [];
    const deps = makeDeps(studio, invokes);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      goal: "Pick an approach",
      participants: [
        { space_id: `spc_${APP}`, persona: "designer" },
        { space_id: `spc_${APP}`, persona: "qa" },
      ],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    const roster = room.roster;

    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(closed.ok).toBe(true);

    const resumed = await resumeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.session_id).toBe(room.session_id);
    expect(resumed.status).toBe("open");
    expect(resumed.roster.map((seat) => seat.participant_id)).toEqual(
      roster.map((seat) => seat.participant_id),
    );
    expect((await studio.getMeetingBySession(room.session_id))?.status).toBe("open");
    expect(invokes.filter((name) => name === "meeting-designer")).toHaveLength(2);

    const said = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: roster[0]?.participant_id,
        to: { all: true },
        text: "continue",
      },
    });
    expect(said.ok).toBe(true);
  });

  test("resume while open is denied", async () => {
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

    const resumed = await resumeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(resumed).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_ALREADY_OPEN,
    });
  });
});
