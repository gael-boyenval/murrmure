import { describe, expect, test, vi } from "vitest";
import { JOURNAL_EVENT_TYPES, MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { emitAndDeliver } from "../../../src/events/emit.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import { prepareMeetingSaid } from "../../../src/meetings/said.js";
import type { HookDispatchDeps } from "../../../src/hooks/dispatch.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";

const NOW = "2026-08-17T00:00:00.000Z";
const APP = "app";
const RESEARCH = "research";

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
  await studio.insertSpace(
    { space_id: RESEARCH, slug: "meetings-research", name: "Research", status: "active" },
    NOW,
  );
  await studio.replaceSpaceIndex(APP, {
    ...emptySnapshot(),
    personas: [
      { key: "designer", digest: "d", payload_json: JSON.stringify({ id: "designer", summary: "d" }) },
      { key: "qa", digest: "q", payload_json: JSON.stringify({ id: "qa", summary: "q" }) },
    ],
  });
  await studio.replaceSpaceIndex(RESEARCH, {
    ...emptySnapshot(),
    personas: [
      { key: "researcher", digest: "r", payload_json: JSON.stringify({ id: "researcher", summary: "r" }) },
    ],
  });
}

function makeDeps(studio: MemoryStudioPersistence): {
  deps: HookDispatchDeps;
  journal: Array<Record<string, unknown>>;
} {
  const journal: Array<Record<string, unknown>> = [];
  let n = 0;
  const deps: HookDispatchDeps = {
    studio,
    handler: {
      appendSpaceJournal: vi.fn(async (entry: Record<string, unknown>) => {
        journal.push(entry);
        n += 1;
        return { seq: n, entry_id: `evt_${n}` };
      }),
    } as unknown as HubHandler,
    ids: { ulid: () => `id${++n}` },
    clock: { nowIso: () => NOW },
    guard: new SpaceConcurrencyGuard(),
    invokeAction: async () => ({ http: 200 }),
  };
  return { deps, journal };
}

async function openRoom(deps: HookDispatchDeps) {
  const convened = await conveneMeeting(deps, {
    title: "API shape",
    participants: [
      { space_id: `spc_${APP}`, persona: "designer" },
      { space_id: `spc_${APP}`, persona: "qa" },
      { space_id: `spc_${RESEARCH}`, persona: "researcher" },
    ],
    chair: { space_id: `spc_${APP}`, persona: "designer" },
    actor_id: "actor_alice",
    token_id: "tok_1",
    convenor_space_id: `spc_${APP}`,
  });
  if (!convened.ok) throw new Error(convened.message);
  return convened;
}

describe("meetings/said", () => {
  test("to xor / speaker drop / TO_EMPTY", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const { deps } = makeDeps(studio);
    const room = await openRoom(deps);
    const designer = room.roster[0]!;
    const qa = room.roster[1]!;

    const both = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: { to: { all: true, participant_ids: [qa.participant_id] }, text: "nope" },
    });
    expect(both).toMatchObject({ ok: false, code: MURRMURE_DENIAL_CODES.TO_AMBIGUOUS });

    const neither = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: { to: {}, text: "nope" },
    });
    expect(neither).toMatchObject({ ok: false, code: MURRMURE_DENIAL_CODES.TO_AMBIGUOUS });

    const all = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: { as_participant_id: designer.participant_id, to: { all: true }, text: "hi" },
    });
    expect(all.ok && "prepared" in all).toBe(true);
    if (all.ok && "prepared" in all) {
      expect(all.prepared.targets.map((seat) => seat.participant_id)).toEqual([
        qa.participant_id,
        room.roster[2]?.participant_id,
      ]);
    }

    const dropSpeaker = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: designer.participant_id,
        to: { participant_ids: [designer.participant_id, qa.participant_id] },
        text: "hi",
      },
    });
    expect(dropSpeaker.ok && "prepared" in dropSpeaker).toBe(true);
    if (dropSpeaker.ok && "prepared" in dropSpeaker) {
      expect(dropSpeaker.prepared.targets.map((seat) => seat.participant_id)).toEqual([qa.participant_id]);
    }

    const onlySelf = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: designer.participant_id,
        to: { participant_ids: [designer.participant_id] },
        text: "hi",
      },
    });
    expect(onlySelf).toMatchObject({ ok: false, code: MURRMURE_DENIAL_CODES.TO_EMPTY });
  });

  test("unknown in_reply_to → REPLY_UNKNOWN", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const { deps } = makeDeps(studio);
    const room = await openRoom(deps);
    const result = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: room.roster[0]?.participant_id,
        to: { all: true },
        text: "reply",
        in_reply_to: "msg_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      },
    });
    expect(result).toMatchObject({ ok: false, code: MURRMURE_DENIAL_CODES.REPLY_UNKNOWN });
  });

  test("hub-stamps from and ignores client from", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const { deps, journal } = makeDeps(studio);
    const room = await openRoom(deps);
    const designer = room.roster[0]!;
    const result = await emitAndDeliver(deps, {
      space_id: `spc_${APP}`,
      event_type: JOURNAL_EVENT_TYPES.MEETING_SAID,
      session_id: room.session_id,
      payload: {
        as_participant_id: designer.participant_id,
        to: { all: true },
        text: "hello",
        from: { spoof: true, participant_id: "ptc_fake" },
      },
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result.ok).toBe(true);
    const said = journal.find((row) => row.type === JOURNAL_EVENT_TYPES.MEETING_SAID);
    expect(said?.data).toMatchObject({
      from: {
        participant_id: designer.participant_id,
        space_id: `spc_${APP}`,
        persona: "designer",
      },
    });
    expect((said?.data as { from?: { spoof?: boolean } })?.from?.spoof).toBeUndefined();
  });

  test("said artifacts add roster spaces and chair actor to ACL", async () => {
    const studio = new MemoryStudioPersistence();
    await seed(studio);
    const { deps } = makeDeps(studio);
    const room = await openRoom(deps);
    await studio.insertArtifact({
      transfer_id: "xfr_note",
      source_space_id: APP,
      name: "note.md",
      digest: "sha256:note",
      size_bytes: 4,
      hold: false,
      authorized_readers: [`spc_${APP}`],
      expires_at: "2026-12-01T00:00:00.000Z",
      created_at: NOW,
    });
    const designer = room.roster[0]!;
    const prepared = await prepareMeetingSaid(deps, {
      space_id: `spc_${APP}`,
      session_id: room.session_id,
      payload: {
        as_participant_id: designer.participant_id,
        to: { all: true },
        text: "note",
        artifacts: ["xfr_note"],
      },
    });
    expect(prepared.ok).toBe(true);
    const row = await studio.getArtifact("xfr_note");
    expect(row?.authorized_readers).toEqual(
      expect.arrayContaining([`spc_${APP}`, `spc_${RESEARCH}`, "actor:actor_alice"]),
    );
  });
});
