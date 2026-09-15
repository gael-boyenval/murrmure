import { describe, expect, test, vi } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import type { HookDispatchDeps } from "../../../src/hooks/dispatch.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import { closeMeeting } from "../../../src/meetings/close.js";
import type { SessionRunDeps } from "../../../src/run/service.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";
import { matchEventHandlers } from "../../../src/index/parse-handlers.js";
import type { HandlerSpec } from "@murrmure/contracts";

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
    hooks: [
      {
        key: "meeting-designer",
        digest: "sha256:hd",
        payload_json: JSON.stringify({
          id: "meeting-designer",
          contract_keys: [],
          on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
          type: "mcp_session",
          complete: "explicit",
        }),
      },
      {
        key: "meeting-qa",
        digest: "sha256:hq",
        payload_json: JSON.stringify({
          id: "meeting-qa",
          contract_keys: [],
          on: { event: { type: "mrmr.meeting.said", participant: "qa" } },
          type: "mcp_session",
          complete: "explicit",
        }),
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
    hooks: [
      {
        key: "meeting-researcher",
        digest: "sha256:hr",
        payload_json: JSON.stringify({
          id: "meeting-researcher",
          contract_keys: [],
          on: { event: { type: "mrmr.meeting.said", participant: "researcher" } },
          type: "mcp_session",
          complete: "explicit",
        }),
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

  test("new meeting stores session.subject from title, not goal", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "LAB_SUBJECT",
      goal: "LAB_GOAL",
      participants: [{ space_id: `spc_${APP}`, persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    const session = await studio.getSession(room.session_id);
    expect(session?.title).toBe("LAB_SUBJECT");
    expect(session?.subject).toBe("LAB_SUBJECT");
    expect(session?.subject).not.toBe("LAB_GOAL");
    expect((await studio.getMeetingBySession(room.session_id))?.goal).toBe("LAB_GOAL");
  });

  test("start_meeting on a closed session aliases resume and keeps the roster", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const deps = makeDeps(studio);
    const first = await conveneMeeting(deps, {
      title: "LAB_SUBJECT",
      goal: "LAB_GOAL",
      participants: [
        { space_id: `spc_${APP}`, persona: "designer" },
        { space_id: `spc_${APP}`, persona: "qa" },
      ],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const closed = await closeMeeting(deps, {
      session_id: first.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(closed.ok).toBe(true);

    const aliased = await conveneMeeting(deps, {
      title: "OTHER_TITLE",
      goal: "OTHER_GOAL",
      session_id: first.session_id,
      participants: [{ space_id: `spc_${APP}`, persona: "qa" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
      human: true,
    });
    expect(aliased.ok).toBe(true);
    if (!aliased.ok) return;
    expect(aliased.resumed).toBe(true);
    expect(aliased.title).toBe("LAB_SUBJECT");
    expect(aliased.goal).toBe("LAB_GOAL");
    expect(aliased.roster.map((seat) => seat.participant_id)).toEqual(
      first.roster.map((seat) => seat.participant_id),
    );
    expect((await studio.getMeetingBySession(first.session_id))?.status).toBe("open");
  });

  test("said handler matches convene doorbell", () => {
    const handler = {
      id: "meeting-designer",
      contract_keys: [],
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "mcp_session",
      complete: "explicit",
    } as HandlerSpec;
    expect(
      matchEventHandlers([handler], {
        event_type: "mrmr.meeting.convened",
        source: "/spaces/spc_app",
        participant: "designer",
      }),
    ).toHaveLength(1);
    expect(
      matchEventHandlers([handler], {
        event_type: "mrmr.meeting.convened",
        source: "/spaces/spc_app",
        participant: "qa",
      }),
    ).toHaveLength(0);
    expect(
      matchEventHandlers([handler], {
        event_type: "mrmr.meeting.resumed",
        source: "/spaces/spc_app",
        participant: "designer",
      }),
    ).toHaveLength(1);
  });

  test("convene wakes each said handler", async () => {
    const studio = new MemoryStudioPersistence();
    await seedSpaces(studio);
    const invokes: string[] = [];
    let n = 0;
    const deps: HookDispatchDeps = {
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
    const result = await conveneMeeting(deps, {
      title: "API shape",
      participants: [
        { space_id: `spc_${APP}`, persona: "designer" },
        { space_id: `spc_${APP}`, persona: "qa" },
        { space_id: `spc_${RESEARCH}`, persona: "researcher" },
      ],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
      convenor_space_id: `spc_${APP}`,
      capabilities: ["space:read", "flow:run"],
    });
    expect(result.ok).toBe(true);
    expect(invokes.sort()).toEqual(["meeting-designer", "meeting-qa", "meeting-researcher"]);
  });
});
