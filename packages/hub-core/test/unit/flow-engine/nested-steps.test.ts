import { describe, expect, test, vi, beforeEach } from "vitest";
import type { FlowManifest, ResolveStepBody } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { buildRunGraph } from "../../../src/flow-engine/graph.js";
import { resolveFlowStep } from "../../../src/flow-engine/step-resolve.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

const NESTED_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "preview-review-nested",
  start: { manual: true },
  steps: [
    {
      id: "intake",
      presentation: { view: "intake-view" },
      branches: {
        continue: { schema: { type: "object", required: ["topic"] }, next: "build" },
        cancel: { schema: { type: "object" }, fail_run: true },
      },
    },
    {
      id: "build",
      role: "agent",
      orchestration: "engine-routed",
      steps: [
        {
          id: "build-loop",
          branches: {
            completed: {
              schema: { type: "object", required: ["preview_url"] },
              goto: "review",
            },
            failed: { schema: { type: "object" }, fail: true },
          },
        },
        {
          id: "review",
          presentation: { view: "review-view" },
          branches: {
            validated: { schema: { type: "object" }, complete: "parent" },
            changes_required: {
              schema: { type: "object" },
              continue: "parent",
              goto: "build-loop",
            },
            cancel: { schema: { type: "object" }, fail: true },
          },
        },
      ],
      branches: {
        completed: { schema: { type: "object" }, next: "archive" },
        failed: { schema: { type: "object" }, fail_run: true },
      },
    },
    {
      id: "archive",
      role: "agent",
      branches: {
        completed: { schema: { type: "object" }, next: null },
        failed: { schema: { type: "object" }, fail_run: true },
      },
    },
  ],
};

const clock = { nowIso: () => "2026-07-08T12:00:00.000Z" };

describe("flow-engine/nested-steps", () => {
  let studio: MemoryStudioPersistence;
  const journalAppend = vi.fn(async () => undefined);
  const dispatchSteps = vi.fn(async () => undefined);

  beforeEach(async () => {
    studio = new MemoryStudioPersistence();
    journalAppend.mockClear();
    dispatchSteps.mockClear();

    const ir = compileFlowIr(NESTED_MANIFEST, "flw_nested");
    const { catalog } = compileStepContractCatalog(NESTED_MANIFEST, "flw_nested");
    if (!catalog) throw new Error("catalog missing");

    await studio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      clock.nowIso(),
    );
    await studio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [
        {
          key: "feature_build",
          digest: "sha256:handlers-build",
          payload_json: JSON.stringify({
            id: "feature_build",
            contract_keys: [
              "preview-review-nested.build",
              "preview-review-nested.build.build-loop",
              "preview-review-nested.build.review",
            ],
            on: "step.opened",
            kill_on: "step.resolved",
            type: "shell_spawn",
            complete: "explicit",
          }),
        },
        {
          key: "feature_archive",
          digest: "sha256:handlers-archive",
          payload_json: JSON.stringify({
            id: "feature_archive",
            contract_keys: ["preview-review-nested.archive"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
          }),
        },
      ],
      events: [],
      flows: [
        {
          flow_id: "flw_nested",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "preview-review-nested",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          step_contract_catalog: catalog,
          payload_json: JSON.stringify({ flow_id: "flw_nested", ir, catalog }),
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
        flow_id: "flw_nested",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: clock.nowIso(),
      },
      clock.nowIso(),
    );
  });

  function deps(handler: HubHandler) {
    return {
      studio,
      handler,
      ids: { ulid: () => "evt_nested" },
      clock,
      dispatchSteps,
    };
  }

  async function seedBuildLoopActive() {
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "working",
      started_at: clock.nowIso(),
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build.build-loop",
      status: "working",
      started_at: clock.nowIso(),
    });
  }

  test("build-loop completed opens build.review without agent invoke", async () => {
    await seedBuildLoopActive();
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    const result = await resolveFlowStep(deps(handler), {
      run_id: "run_run1",
      step_id: "build.build-loop",
      body: {
        branch: "completed",
        payload: { preview_url: "http://127.0.0.1:5173" },
      } satisfies ResolveStepBody,
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal: { append: journalAppend },
    });

    expect(result.ok).toBe(true);
    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((m) => m.step_id === "build.build-loop")?.status).toBe("completed");
    expect(memos.find((m) => m.step_id === "build.review")?.status).toBe("awaiting_human");
    expect(memos.find((m) => m.step_id === "build")?.status).toBe("working");
    expect(dispatchSteps).not.toHaveBeenCalled();
  });

  test("review validated completes parent and opens archive", async () => {
    await seedBuildLoopActive();
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build.build-loop",
      status: "completed",
      completed_at: clock.nowIso(),
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build.review",
      status: "awaiting_human",
      started_at: clock.nowIso(),
    });
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    await resolveFlowStep(deps(handler), {
      run_id: "run_run1",
      step_id: "build.review",
      body: { branch: "validated", payload: {} },
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal: { append: journalAppend },
    });

    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((m) => m.step_id === "build")?.status).toBe("completed");
    expect(memos.find((m) => m.step_id === "archive")?.status).toBe("working");
    expect(dispatchSteps).toHaveBeenCalled();
  });

  test("changes_required reopens build-loop with incremented iteration", async () => {
    await seedBuildLoopActive();
    await studio.updateRunFlowBinding("run1", {
      flow_id: "flw_nested",
      flow_digest: "sha256:nested",
      exec_context: {
        steps: {
          "build.build-loop": { output: { preview_url: "http://old", iteration: 1 } },
        },
      },
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build.build-loop",
      status: "completed",
      completed_at: clock.nowIso(),
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build.review",
      status: "awaiting_human",
      started_at: clock.nowIso(),
    });
    const handler = { appendSpaceJournal: journalAppend } as unknown as HubHandler;

    await resolveFlowStep(deps(handler), {
      run_id: "run_run1",
      step_id: "build.review",
      body: { branch: "changes_required", payload: { comments: ["Fix header"] } },
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      journal: { append: journalAppend },
    });

    const memos = await studio.listRunStepMemos("run_run1");
    expect(memos.find((m) => m.step_id === "build.build-loop")?.status).toBe("working");
    expect(memos.find((m) => m.step_id === "build")?.status).toBe("working");
    const run = await studio.getRun("run1");
    const loopOut = (run?.exec_context.steps as Record<string, { output?: { iteration?: number } }>)?.[
      "build.build-loop"
    ]?.output;
    expect(loopOut?.iteration).toBe(2);
  });

  test("run graph includes nested step nodes", async () => {
    const { catalog } = compileStepContractCatalog(NESTED_MANIFEST, "flw_nested");
    const graph = buildRunGraph({
      run_id: "run_run1",
      step_contract_catalog: catalog,
      step_memos: [
        { run_id: "run_run1", step_id: "build", status: "working" },
        { run_id: "run_run1", step_id: "build.build-loop", status: "working" },
      ],
    });
    expect(graph.nodes.map((n) => n.step_id)).toEqual([
      "intake",
      "build",
      "build.build-loop",
      "build.review",
      "archive",
    ]);
    expect(graph.nodes.find((n) => n.step_id === "build.review")?.parent_step_id).toBe("build");
    expect(graph.edges.some((e) => e.target === "step:build.build-loop" && e.source === "step:build.review")).toBe(
      true,
    );
  });
});
