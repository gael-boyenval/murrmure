import { describe, expect, test, vi } from "vitest";
import type { FlowManifest, StepContractCatalog } from "@murrmure/contracts";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { bootstrapStepContractFlow, resolveFlowStep } from "../../../src/flow-engine/step-resolve.js";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";

function linearManifest(): FlowManifest {
  return {
    apiVersion: "murrmure.flow/v1",
    name: "linear-resolve",
    start: { manual: true },
    steps: [
      {
        id: "intake",
        presentation: { view: "intake-view" },
        branches: {
          continue: {
            schema: { type: "object", required: ["topic"] },
            next: "work",
          },
          cancel: { schema: { type: "object" }, fail_run: true },
        },
      },
      {
        id: "work",
        executor: { action: "do_work", params: { topic: "{{input.topic}}" } },
        branches: {
          completed: { schema: { type: "object" }, next: null },
          failed: { schema: { type: "object" }, fail_run: true },
        },
      },
    ],
  };
}

async function seedCatalogRun(studio: MemoryStudioPersistence) {
  const manifest = linearManifest();
  const ir = compileFlowIr(manifest, "flw_linear");
  const { catalog } = compileStepContractCatalog(manifest, "flw_linear");
  if (!catalog) throw new Error("catalog missing");

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
        start: { manual: true },
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
      title: "test",
      actor_id: "actor_a",
      status: "active",
      spaces_touched: ["spc_demo"],
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
      exec_context: { input: {} },
      reference_run_ids: [],
      started_at: clock.nowIso(),
    },
    clock.nowIso(),
  );

  return { ir, catalog: catalog as StepContractCatalog };
}

const clock = { nowIso: () => "2026-07-08T12:00:00.000Z" };
const ids = { ulid: () => "evt_test" };

describe("flow-engine/advance-runner (step contracts)", () => {
  test("bootstrap opens first human step as awaiting_human", async () => {
    const studio = new MemoryStudioPersistence();
    await seedCatalogRun(studio);

    const dispatchSteps = vi.fn().mockResolvedValue(undefined);
    const opened = await bootstrapStepContractFlow(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn() } as never,
        ids,
        clock,
        cancelTimeoutMs: 5000,
        resolveFlowAuth: async () => ({
          actor_id: "actor_a",
          token_id: "tok_a",
          capabilities: ["flow:run", "action:invoke"],
        }),
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        actor_id: "actor_a",
        token_id: "tok_a",
      },
    );

    expect(opened).toBe(true);
    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((m) => m.step_id === "intake")?.status).toBe("awaiting_human");
    expect(dispatchSteps).not.toHaveBeenCalled();
  });

  test("resolve continue opens executor step; completed finishes run", async () => {
    const studio = new MemoryStudioPersistence();
    await seedCatalogRun(studio);

    const dispatchSteps = vi.fn().mockResolvedValue(undefined);
    const deps = {
      studio,
      handler: { appendSpaceJournal: vi.fn() } as never,
      ids,
      clock,
      cancelTimeoutMs: 5000,
      dispatchSteps,
    };

    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "intake",
      status: "awaiting_human",
      started_at: clock.nowIso(),
    });

    const journal = { append: vi.fn().mockResolvedValue(undefined) };
    const intakeResult = await resolveFlowStep(deps, {
      run_id: "run_run1",
      step_id: "intake",
      body: { branch: "continue", payload: { topic: "news" } },
      actor_id: "actor_a",
      token_id: "tok_a",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal,
    });
    expect(intakeResult.ok).toBe(true);

    const afterIntake = await studio.listRunStepMemos("run_run1");
    expect(afterIntake.find((m) => m.step_id === "work")?.status).toBe("working");
    expect(dispatchSteps).toHaveBeenCalledTimes(1);

    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "work",
      status: "working",
      started_at: clock.nowIso(),
    });

    const workResult = await resolveFlowStep(deps, {
      run_id: "run_run1",
      step_id: "work",
      body: { branch: "completed", payload: { ok: true } },
      actor_id: "actor_a",
      token_id: "tok_a",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal,
    });
    expect(workResult.ok).toBe(true);

    const run = await studio.getRun("run1");
    expect(run?.lifecycle).toBe("completed");
  });

  test("reject unknown branch", async () => {
    const studio = new MemoryStudioPersistence();
    await seedCatalogRun(studio);
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "intake",
      status: "awaiting_human",
    });

    const result = await resolveFlowStep(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn() } as never,
        ids,
        clock,
        cancelTimeoutMs: 5000,
        dispatchSteps: vi.fn(),
      },
      {
        run_id: "run_run1",
        step_id: "intake",
        body: { branch: "nope" },
        actor_id: "actor_a",
        token_id: "tok_a",
        space_id: "spc_demo",
        journal: { append: vi.fn() },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BRANCH_NOT_FOUND");
    }
  });

  test("maybeAdvanceFlow fails run when executor step failed with fail_run branch", async () => {
    const studio = new MemoryStudioPersistence();
    await seedCatalogRun(studio);
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "work",
      status: "failed",
      error_code: "ACTION_TIMED_OUT",
      completed_at: clock.nowIso(),
    });

    const { maybeAdvanceFlow } = await import("../../../src/flow-engine/advance-runner.js");
    await maybeAdvanceFlow(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn() } as never,
        ids,
        clock,
        cancelTimeoutMs: 5000,
        resolveFlowAuth: async () => ({
          actor_id: "actor_a",
          token_id: "tok_a",
          capabilities: ["flow:run"],
        }),
        dispatchSteps: vi.fn(),
      },
      {
        run_id: "run_run1",
        step_id: "work",
        actor_id: "actor_a",
        token_id: "tok_a",
      },
    );

    const run = await studio.getRun("run1");
    expect(run?.lifecycle).toBe("failed");
  });
});
