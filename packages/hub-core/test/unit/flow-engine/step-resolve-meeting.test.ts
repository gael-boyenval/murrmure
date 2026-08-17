import { describe, expect, test, vi } from "vitest";
import type { FlowManifest } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { conveneMeeting } from "../../../src/meetings/convene.js";
import { closeMeeting } from "../../../src/meetings/close.js";
import type { FlowAdvanceDeps } from "../../../src/flow-engine/advance-runner.js";
import type { HubHandler } from "../../../src/handlers/hub.js";
import { SpaceConcurrencyGuard } from "../../../src/run/space-guard.js";

const NOW = "2026-08-17T10:00:00.000Z";
const APP = "app";

const MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "api-shape",
  triggers: { manual: true },
  steps: [
    {
      id: "decide",
      description: "Agree the API shape",
      meeting: {
        participants: [{ space: "spc_app", persona: "designer" }],
        chair: { space: "spc_app", persona: "designer" },
      },
    },
    { id: "implement", description: "Build it" },
  ],
};

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

async function seedBoundRun(studio: MemoryStudioPersistence) {
  const ir = compileFlowIr(MANIFEST, "flw_api_shape");
  const { catalog } = compileStepContractCatalog(MANIFEST, "flw_api_shape");
  if (!catalog) throw new Error("catalog missing");

  await studio.insertSpace(
    { space_id: APP, slug: "meetings-app", name: "App", status: "active", members: [] },
    NOW,
  );
  await studio.replaceSpaceIndex(APP, {
    ...emptySnapshot(),
    personas: [
      {
        key: "designer",
        digest: "d",
        payload_json: JSON.stringify({ id: "designer", summary: "d" }),
      },
    ],
    flows: [
      {
        flow_id: "flw_api_shape",
        origin_space_id: "spc_app",
        digest: ir.digest,
        name: "api-shape",
        triggers: { manual: true },
        step_spaces: ["spc_app"],
        grants_required: [],
        ir,
        step_contract_catalog: catalog,
        payload_json: JSON.stringify({ flow_id: "flw_api_shape", ir, catalog }),
      },
    ],
  });
  await studio.insertSession(
    {
      session_id: "ses1",
      title: "API shape",
      status: "active",
      created_by: { type: "actor", actor_id: "actor_alice" },
      spaces_touched: ["spc_app"],
      actor_id: "actor_alice",
    },
    NOW,
  );
  await studio.insertRun(
    {
      run_id: "run1",
      session_id: "ses1",
      space_id: APP,
      flow_id: "flw_api_shape",
      flow_digest: ir.digest,
      lifecycle: "working",
      exec_context: { input: {} },
      reference_run_ids: [],
      started_at: NOW,
    },
    NOW,
  );
  await studio.upsertRunStepMemo({
    run_id: "run_run1",
    step_id: "decide",
    status: "working",
    started_at: NOW,
  });
}

function makeDeps(studio: MemoryStudioPersistence): FlowAdvanceDeps {
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
    resolveFlowAuth: async () => ({
      actor_id: "actor_alice",
      token_id: "tok_1",
      capabilities: ["flow:run"],
    }),
    dispatchSteps: vi.fn(async () => undefined),
  };
}

describe("flow-engine/step-resolve-meeting", () => {
  test("close with bound run/step resolves completed and opens implement", async () => {
    const studio = new MemoryStudioPersistence();
    await seedBoundRun(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      session_id: "ses_ses1",
      participants: [{ space_id: "spc_app", persona: "designer" }],
      chair: { space_id: "spc_app", persona: "designer" },
      actor_id: "actor_alice",
      token_id: "tok_1",
      bound_run_id: "run_run1",
      bound_step_id: "decide",
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const closed = await closeMeeting(deps, {
      session_id: room.session_id,
      actor_id: "actor_alice",
      token_id: "tok_1",
      emitter_space_id: "spc_app",
      as_participant_id: room.roster[0]?.participant_id,
    });
    expect(closed.ok).toBe(true);
    if (closed.ok) expect(closed.outcome).toBe("completed");

    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((memo) => memo.step_id === "decide")?.status).toBe("completed");
    expect(memos.find((memo) => memo.step_id === "implement")?.status).toBe("working");
  });

  test("close failed resolves the bound step failed", async () => {
    const studio = new MemoryStudioPersistence();
    await seedBoundRun(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "API shape",
      session_id: "ses_ses1",
      participants: [{ space_id: "spc_app", persona: "designer" }],
      chair: { human: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
      bound_run_id: "run_run1",
      bound_step_id: "decide",
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

    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((memo) => memo.step_id === "decide")?.status).toBe("failed");
    expect(memos.find((memo) => memo.step_id === "implement")).toBeUndefined();
    expect((await studio.getRun("run1"))?.lifecycle).toBe("failed");
  });

  test("headless close without bound_* does not resolve a flow step", async () => {
    const studio = new MemoryStudioPersistence();
    await seedBoundRun(studio);
    const deps = makeDeps(studio);
    const room = await conveneMeeting(deps, {
      title: "Headless",
      session_id: "ses_ses1",
      participants: [{ space_id: "spc_app", persona: "designer" }],
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
    });
    expect(closed.ok).toBe(true);

    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((memo) => memo.step_id === "decide")?.status).toBe("working");
    expect(memos.find((memo) => memo.step_id === "implement")).toBeUndefined();
  });
});
