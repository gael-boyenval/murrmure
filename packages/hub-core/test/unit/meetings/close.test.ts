import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES, MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import { closeMeeting } from "../../../src/meetings/close.js";
import { prepareMeetingSaid } from "../../../src/meetings/said.js";
import type { SessionRunDeps } from "../../../src/run/service.js";
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
  });
}

function makeDeps(studio: MemoryStudioPersistence): SessionRunDeps {
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
  };
}

describe("meetings/close", () => {
  test("chair close; said after → MEETING_CLOSED", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      participants: [
        { space_id: `spc_${APP}`, persona: "designer" },
        { space_id: `spc_${APP}`, persona: "qa" },
      ],
      chair: { space_id: `spc_${APP}`, persona: "designer" },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const nonChair = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_bob",
      token_id: "tok_2",
      emitter_space_id: `spc_${APP}`,
      as_participant_id: room.roster[1]?.participant_id,
    });
    expect(nonChair).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED,
    });

    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      emitter_space_id: `spc_${APP}`,
      as_participant_id: room.roster[0]?.participant_id,
      reason: "goal reached",
    });
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.status).toBe("closed");
      expect(closed.outcome).toBe("completed");
    }
    expect((await studio.getMeetingBySession(room.session_id))?.status).toBe("closed");

    const said = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: room.roster[0]?.participant_id,
        to: { all: true },
        text: "too late",
      },
    });
    expect(said).toMatchObject({ ok: false, code: MURRMURE_DENIAL_CODES.MEETING_CLOSED });
  });

  test("human chair HTTP close; failed stores snapshot failed", async () => {
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

    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
      failed: true,
    });
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.outcome).toBe("failed");
    expect((await studio.getMeetingBySession(room.session_id))?.close_outcome).toBe("failed");
  });

  test("convenor may close an agent-chaired room", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      participants: [
        { space_id: `spc_${APP}`, persona: "designer" },
        { space_id: `spc_${APP}`, persona: "qa" },
      ],
      chair: { space_id: `spc_${APP}`, persona: "designer" },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const denied = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_bob",
      token_id: "tok_2",
      human: true,
    });
    expect(denied).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_CHAIR_REQUIRED,
    });

    const asConvenor = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_carol",
      token_id: "tok_3",
      human: true,
      convenor: true,
    });
    expect(asConvenor.ok).toBe(true);
    expect((await studio.getMeetingBySession(room.session_id))?.status).toBe("closed");
  });

  test("operator may close after convenor path is unused", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      participants: [{ space_id: `spc_${APP}`, persona: "designer" }],
      chair: { space_id: `spc_${APP}`, persona: "designer" },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_bob",
      token_id: "tok_2",
      human: true,
      operator: true,
    });
    expect(closed.ok).toBe(true);
    expect((await studio.getMeetingBySession(room.session_id))?.status).toBe("closed");
  });
});
