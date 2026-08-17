import { describe, expect, test, vi } from "vitest";
import type { FlowManifest } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { openStepContract } from "../../../src/flow-engine/step-open.js";
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
      description: "Designer and researcher agree the API shape",
      meeting: {
        participants: [{ space: "{{input.app_space}}", persona: "designer" }],
        chair: { space: "{{input.app_space}}", persona: "designer" },
        goal: "{{input.goal}}",
      },
    },
    { id: "implement", description: "Build what the meeting decided" },
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

async function seed(studio: MemoryStudioPersistence) {
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
        payload_json: JSON.stringify({ id: "designer", summary: "Product design" }),
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
      exec_context: { input: { app_space: "spc_app", goal: "Pick pagination" } },
      reference_run_ids: [],
      started_at: NOW,
    },
    NOW,
  );
  return catalog;
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

describe("flow-engine/step-open-meeting", () => {
  test("opening decide convenes on this session and binds the step", async () => {
    const studio = new MemoryStudioPersistence();
    const catalog = await seed(studio);
    const entry = catalog.entries.find((row) => row.step_id === "decide");
    expect(entry?.meeting).toBeTruthy();
    const deps = makeDeps(studio);

    await openStepContract(deps, {
      run_id: "run_run1",
      session_id: "ses_ses1",
      space_id: "spc_app",
      step_id: "decide",
      entry: entry!,
      exec_context: { input: { app_space: "spc_app", goal: "Pick pagination" } },
      actor_id: "actor_alice",
      token_id: "tok_1",
      journal: { append: vi.fn(async () => undefined) },
    });

    const meeting = await studio.getMeetingBySession("ses_ses1");
    expect(meeting?.status).toBe("open");
    expect(meeting?.goal).toBe("Pick pagination");
    expect(meeting?.bound_run_id).toBe("run_run1");
    expect(meeting?.bound_step_id).toBe("decide");
    expect(meeting?.roster).toEqual([
      expect.objectContaining({ space_id: "spc_app", persona: "designer" }),
    ]);
    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((memo) => memo.step_id === "decide")?.status).toBe("working");
  });
});
