import { describe, expect, test, vi } from "vitest";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { emitAndDeliver } from "../../../src/events/emit.js";
import type { HookDispatchDeps } from "../../../src/hooks/dispatch.js";
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

function makeDeps(
  studio: MemoryStudioPersistence,
  invokeAction: HookDispatchDeps["invokeAction"] = async () => ({ http: 200 }),
): {
  deps: HookDispatchDeps;
  journal: Array<Record<string, unknown>>;
  order: string[];
} {
  const journal: Array<Record<string, unknown>> = [];
  const order: string[] = [];
  let counter = 0;
  const deps: HookDispatchDeps = {
    studio,
    handler: {
      appendSpaceJournal: vi.fn(async (entry: Record<string, unknown>) => {
        order.push(`journal:${String(entry.type)}`);
        journal.push(entry);
        const seq = entry.type === "brief.requested" ? 42 : journal.length;
        return { seq, entry_id: String(entry.event_id ?? `evt_${journal.length}`) };
      }),
    } as unknown as HubHandler,
    ids: { ulid: () => `id${++counter}` },
    clock: { nowIso: () => NOW },
    guard: new SpaceConcurrencyGuard(),
    invokeAction: async (input) => {
      order.push("invoke");
      return invokeAction(input);
    },
  };
  return { deps, journal, order };
}

describe("events/emitAndDeliver", () => {
  test("returns real journal seq", async () => {
    const studio = await freshStudio();
    const { deps } = makeDeps(studio);
    const result = await emitAndDeliver(deps, {
      space_id: "spc_demo",
      event_type: "brief.requested",
      payload: { prompt: "write summary" },
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result).toMatchObject({ ok: true, type: "brief.requested", seq: 42 });
    if (result.ok) expect(result.event_id).toMatch(/^evt_/);
  });

  test("journals before dispatch", async () => {
    const studio = await freshStudio();
    const snapshot = await studio.getSpaceIndexSnapshot(SPACE);
    await studio.replaceSpaceIndex(SPACE, {
      ...emptySnapshot(),
      ...snapshot,
      hooks: [
        {
          key: "brief-wake",
          digest: "sha256:emit",
          payload_json: JSON.stringify({
            id: "brief-wake",
            contract_keys: [],
            on: { event: { type: "brief.requested" } },
            type: "mcp_session",
            complete: "explicit",
          }),
        },
      ],
    });
    const { deps, order, journal } = makeDeps(studio);
    const result = await emitAndDeliver(deps, {
      space_id: "spc_demo",
      event_type: "brief.requested",
      payload: { prompt: "write summary" },
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result.ok).toBe(true);
    expect(order[0]).toBe("journal:brief.requested");
    expect(order).toContain("invoke");
    expect(order.indexOf("journal:brief.requested")).toBeLessThan(order.indexOf("invoke"));
    expect(journal[0]?.type).toBe("brief.requested");
  });

  test("said without session_id is denied and does not journal", async () => {
    const studio = await freshStudio();
    const { deps, journal } = makeDeps(studio);
    const result = await emitAndDeliver(deps, {
      space_id: "spc_demo",
      event_type: "mrmr.meeting.said",
      payload: { text: "hello" },
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result).toEqual({
      ok: false,
      code: MURRMURE_DENIAL_CODES.MEETING_SESSION_REQUIRED,
      message: "Meeting events require a top-level session_id",
      http: 400,
    });
    expect(journal).toHaveLength(0);
  });

  test("convened is denylisted", async () => {
    const studio = await freshStudio();
    const { deps, journal } = makeDeps(studio);
    const result = await emitAndDeliver(deps, {
      space_id: "spc_demo",
      event_type: "mrmr.meeting.convened",
      session_id: "ses_room1",
      payload: {},
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result).toMatchObject({
      ok: false,
      code: MURRMURE_DENIAL_CODES.HUB_ONLY_EVENT,
      http: 403,
    });
    expect(journal).toHaveLength(0);
  });

  test("brief.requested still journals", async () => {
    const studio = await freshStudio();
    const { deps, journal } = makeDeps(studio);
    const result = await emitAndDeliver(deps, {
      space_id: "spc_demo",
      event_type: "brief.requested",
      event_id: "evt_brief_keep",
      payload: { prompt: "write summary", from: { spoof: true } },
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ ok: true, event_id: "evt_brief_keep" });
    expect(journal[0]).toMatchObject({
      type: "brief.requested",
      data: {
        prompt: "write summary",
        from: { space_id: "spc_demo", actor_id: "actor_alice" },
      },
    });
    expect((journal[0]?.data as { from?: { spoof?: boolean } })?.from?.spoof).toBeUndefined();
  });
});
