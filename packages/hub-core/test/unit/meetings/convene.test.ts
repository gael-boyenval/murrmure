import { describe, expect, test, vi } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import type { SessionRunDeps } from "../../../src/run/service.js";
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

async function seedSpaces(studio: MemoryStudioPersistence): Promise<void> {
  await studio.insertSpace({ space_id: APP, slug: "meetings-app", name: "App", status: "active" }, NOW);
  await studio.insertSpace(
    { space_id: RESEARCH, slug: "meetings-research", name: "Research", status: "active" },
    NOW,
  );
  await studio.replaceSpaceIndex(APP, {
    ...emptySnapshot(),
    personas: [
      {
        key: "designer",
        digest: "sha256:d",
        payload_json: JSON.stringify({ id: "designer", summary: "Product design" }),
      },
      {
        key: "qa",
        digest: "sha256:q",
        payload_json: JSON.stringify({ id: "qa", summary: "Quality" }),
      },
    ],
  });
  await studio.replaceSpaceIndex(RESEARCH, {
    ...emptySnapshot(),
    personas: [
      {
        key: "researcher",
        digest: "sha256:r",
        payload_json: JSON.stringify({ id: "researcher", summary: "Prior art" }),
      },
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

describe("meetings/convene", () => {
  test("three ptc_* and one ses_*", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const deps = makeDeps(studio);
    const result = await conveneMeeting(deps, {
      title: "API shape",
      goal: "Pick an approach",
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
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session_id).toMatch(/^ses_/);
    expect(result.roster).toHaveLength(3);
    expect(result.roster.every((seat) => seat.participant_id.startsWith("ptc_"))).toBe(true);
    expect(result.chair).toEqual({ participant_id: result.roster[0]?.participant_id });
    const session = await studio.getSession(result.session_id);
    expect(session).toBeTruthy();
    expect(new Set(session?.spaces_touched)).toEqual(new Set([APP, RESEARCH]));
    const snap = await studio.getMeetingBySession(result.session_id);
    expect(snap?.status).toBe("open");
    expect(snap?.roster).toHaveLength(3);
  });

  test("unknown persona → PERSONA_NOT_FOUND", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const result = await conveneMeeting(makeDeps(studio), {
      title: "API shape",
      participants: [{ space_id: `spc_${APP}`, persona: "ghost" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(result).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.PERSONA_NOT_FOUND,
    });
  });

  test("second convene while open → MEETING_ALREADY_OPEN", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const deps = makeDeps(studio);
    const first = await conveneMeeting(deps, {
      title: "API shape",
      participants: [{ space_id: `spc_${APP}`, persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await conveneMeeting(deps, {
      title: "Again",
      session_id: first.session_id,
      participants: [{ space_id: `spc_${APP}`, persona: "qa" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(second).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_ALREADY_OPEN,
      http: 409,
    });
  });
});
