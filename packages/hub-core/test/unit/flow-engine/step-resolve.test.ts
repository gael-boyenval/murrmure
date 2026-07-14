import { describe, expect, test, vi, beforeEach } from "vitest";
import type { ResolveStepBody } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { resolveFlowStep } from "../../../src/flow-engine/step-resolve.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

const clock = { nowIso: () => "2026-07-08T10:00:00.000Z" };

async function seedRun(studio: MemoryStudioPersistence) {
  const manifest = {
    apiVersion: "murrmure.flow/v1" as const,
    name: "linear-resolve",
    triggers: { manual: true },
    steps: [
      {
        id: "intake",
        branches: {
          continue: { schema: { type: "object", required: ["topic"] }, route: { step: "work" } },
          cancel: { schema: { type: "object" }, route: { run: "failed" } },
        },
      },
      {
        id: "work",
      },
    ],
  };
  const ir = compileFlowIr(manifest, "flw_linear");
  const { catalog } = compileStepContractCatalog(manifest, "flw_linear");
  if (!catalog) throw new Error("catalog missing");

  await studio.insertSpace(
    { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
    clock.nowIso(),
  );
  await studio.replaceSpaceIndex("demo", {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    flows: [
      {
        flow_id: "flw_linear",
        origin_space_id: "spc_demo",
        digest: ir.digest,
        name: "linear",
        triggers: { manual: true },
        step_spaces: ["spc_demo"],
        grants_required: [],
        ir,
        step_contract_catalog: catalog,
        payload_json: JSON.stringify({ flow_id: "flw_linear", ir, catalog }),
      },
    ],
  });
  await studio.insertSession(
    {
      session_id: "ses1",
      title: "Test",
      status: "active",
      created_by: { type: "actor", actor_id: "actor_alice" },
      spaces_touched: ["spc_demo"],
      actor_id: "actor_alice",
    },
    clock.nowIso(),
  );
  await studio.insertRun(
    {
      run_id: "run1",
      session_id: "ses1",
      space_id: "demo",
      flow_id: "flw_linear",
      flow_digest: ir.digest,
      lifecycle: "working",
      exec_context: {},
      reference_run_ids: [],
      started_at: clock.nowIso(),
    },
    clock.nowIso(),
  );
  await studio.upsertRunStepMemo({
    run_id: "run_run1",
    step_id: "intake",
    status: "working",
    started_at: clock.nowIso(),
  });
}

describe("unit/flow-engine/step-resolve", () => {
  let studio: MemoryStudioPersistence;
  const journalAppend = vi.fn(async () => undefined);

  beforeEach(async () => {
    studio = new MemoryStudioPersistence();
    journalAppend.mockClear();
    await seedRun(studio);
  });

  function deps(handler: HubHandler) {
    return {
      studio,
      handler,
      ids: { ulid: () => "evt_test" },
      clock,
      dispatchSteps: vi.fn(async () => undefined),
    };
  }

  test("rejects resolve when run is terminal", async () => {
    await studio.updateRunLifecycle("run1", "failed", clock.nowIso());
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    const result = await resolveFlowStep(deps(handler), {
      run_id: "run_run1",
      step_id: "intake",
      body: { branch: "continue", payload: { topic: "x" } } satisfies ResolveStepBody,
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal: { append: journalAppend },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("RUN_TERMINAL");
    expect(result.http).toBe(409);
  });

  test("rejects duplicate resolve on completed step without idempotency key", async () => {
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "intake",
      status: "completed",
      completed_at: clock.nowIso(),
    });
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    const result = await resolveFlowStep(deps(handler), {
      run_id: "run_run1",
      step_id: "intake",
      body: { branch: "continue", payload: { topic: "x" } },
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal: { append: journalAppend },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STEP_TERMINAL");
    expect(result.http).toBe(409);
  });
});
