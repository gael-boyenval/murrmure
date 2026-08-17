import { describe, expect, test, vi } from "vitest";
import { HandlerEventFilterSchema, HandlerSpecSchema, JOURNAL_EVENT_TYPES } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { dispatchHooksForEvent, type HookDispatchDeps } from "../../../src/hooks/dispatch.js";
import { matchEventHandlers } from "../../../src/index/parse-handlers.js";
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

function briefWakeHandler(overrides: Record<string, unknown> = {}) {
  return {
    id: "brief-wake",
    contract_keys: [],
    on: { event: { type: "brief.requested" } },
    type: "mcp_session",
    complete: "explicit",
    ...overrides,
  };
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
      digest: "sha256:char",
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

const briefEvent = {
  event_id: "evt_brief_1",
  event_type: "brief.requested",
  space_id: "spc_demo",
  source: "/spaces/spc_demo",
  payload: { prompt: "write summary" },
};

describe("hooks/dispatchEventHandler characterization (pre-meeting split)", () => {
  test("non-meeting event handler always createSession", async () => {
    const studio = await freshStudio();
    await installHooks(studio, [briefWakeHandler()]);
    const { deps } = makeDeps(studio);

    const results = await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });

    expect(results).toEqual([
      { outcome: "delivered", session_id: "ses_id1", run_id: "run_id2" },
    ]);
    const sessions = await studio.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.title).toBe("Handler brief-wake");
    expect(sessions[0]?.created_by).toEqual({ type: "hook", hook_id: "brief-wake" });
  });

  test("dedupes by source|event_id|handler_id", async () => {
    const studio = await freshStudio();
    await installHooks(studio, [briefWakeHandler()]);
    const { deps } = makeDeps(studio);

    const first = await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });
    const second = await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });

    expect(first[0]?.outcome).toBe("delivered");
    expect(second).toEqual([{ outcome: "deduped", run_id: "run_id2" }]);
    expect(await studio.listSessions()).toHaveLength(1);
  });

  test("invokeAction receives the created session_id", async () => {
    const studio = await freshStudio();
    await installHooks(studio, [briefWakeHandler()]);
    const invokes: Array<Record<string, unknown>> = [];
    const { deps } = makeDeps(studio, async (input) => {
      invokes.push(input);
      return { http: 200 };
    });

    await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });

    expect(invokes).toHaveLength(1);
    expect(invokes[0]?.session_id).toBe("ses_id1");
    expect(invokes[0]?.run_id).toBe("run_id2");
    expect(invokes[0]?.action_name).toBe("brief-wake");
    expect(invokes[0]?.step_id).toBe("hook:brief-wake");
  });

  test("journals mrmr.hook.delivered on the created session", async () => {
    const studio = await freshStudio();
    await installHooks(studio, [briefWakeHandler()]);
    const { deps, journal } = makeDeps(studio);

    await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });

    const delivered = journal.filter((row) => row.type === JOURNAL_EVENT_TYPES.HOOK_DELIVERED);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.session_id).toBe("ses_id1");
    expect(delivered[0]?.run_id).toBe("run_id2");
    expect(delivered[0]?.data).toMatchObject({
      hook_id: "brief-wake",
      event_id: "evt_brief_1",
      event_type: "brief.requested",
    });
    expect(journal.some((row) => row.type === JOURNAL_EVENT_TYPES.SESSION_CREATED)).toBe(true);
  });

  test("matchEventHandlers uses participant for mrmr.meeting.said", () => {
    const kept = HandlerEventFilterSchema.parse({
      type: "mrmr.meeting.said",
      participant: "designer",
    });
    expect(kept).toEqual({ type: "mrmr.meeting.said", participant: "designer" });

    const parsed = HandlerSpecSchema.parse({
      id: "meeting-designer",
      on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
      type: "mcp_session",
    });
    expect(parsed.on).toEqual({ event: { type: "mrmr.meeting.said", participant: "designer" } });

    const handlers = [
      {
        id: "meeting-designer",
        contract_keys: [],
        on: { event: { type: "mrmr.meeting.said", participant: "designer" } },
        type: "mcp_session" as const,
        complete: "explicit" as const,
      },
    ];
    expect(
      matchEventHandlers(handlers, {
        event_type: "mrmr.meeting.said",
        source: "/spaces/spc_demo",
        participant: "designer",
      }).map((h) => h.id),
    ).toEqual(["meeting-designer"]);
    expect(
      matchEventHandlers(handlers, {
        event_type: "mrmr.meeting.said",
        source: "/spaces/spc_demo",
        participant: "qa",
      }),
    ).toHaveLength(0);
  });

  test("legacy hook ensure_session path still createSession", async () => {
    const studio = await freshStudio();
    await installHooks(studio, [
      {
        name: "legacy-brief",
        on: { event: { type: "brief.requested" } },
        do: [{ ensure_session: { title: "Legacy brief" } }],
      },
    ]);
    const { deps, journal } = makeDeps(studio);

    const results = await dispatchHooksForEvent(deps, briefEvent, {
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["event:emit"],
    });

    expect(results[0]?.outcome).toBe("delivered");
    const sessions = await studio.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.title).toBe("Legacy brief");
    expect(sessions[0]?.created_by).toEqual({ type: "hook", hook_id: "legacy-brief" });
    expect(journal.some((row) => row.type === JOURNAL_EVENT_TYPES.HOOK_DELIVERED)).toBe(true);
  });
});
