import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { FlowIr, FlowManifest } from "@murrmure/contracts";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import {
  buildCheckpointDispatch,
  isDeclarativeCheckpointStep,
} from "../../../src/flow-engine/checkpoint-dispatch.js";
import {
  buildStepDispatch,
  nextCheckpointAfterComplete,
} from "../../../src/flow-engine/advance.js";
import {
  mergeCheckpointOutputIntoInput,
  mergeStepOutputIntoExecContext,
} from "../../../src/flow-engine/exec-context.js";
import { resolveStepParams } from "../../../src/flow-engine/templates.js";
import {
  CHECKPOINT_BRANCH_MAX_DEPTH,
  isBackwardGoto,
  planOnResolveBranch,
} from "../../../src/flow-engine/checkpoint-resolve.js";
import { advanceFlowAfterCheckpointResolve } from "../../../src/flow-engine/checkpoint-runner.js";
import { maybeAdvanceFlow } from "../../../src/flow-engine/advance-runner.js";
import { laneExecContext } from "../../../src/flow-engine/matrix.js";
import { resolveGateV2 } from "../../../src/gates/service.js";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";

function manifest(steps: FlowManifest["steps"], name = "test"): FlowManifest {
  return { apiVersion: "murrmure.flow/v1", name, start: { manual: true }, steps };
}

function irFrom(steps: FlowManifest["steps"]): FlowIr {
  return compileFlowIr(manifest(steps), "flw_test");
}

async function seedFlowIndex(studio: MemoryStudioPersistence, ir: FlowIr, flowId = "flw_test") {
  await studio.replaceSpaceIndex("demo", {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    flows: [
      {
        flow_id: flowId,
        origin_space_id: "spc_demo",
        digest: ir.digest,
        name: "test",
        start: { manual: true },
        step_spaces: ["spc_demo"],
        grants_required: [],
        ir,
        payload_json: JSON.stringify({ flow_id: flowId, ir }),
      },
    ],
  });
}

const testDeps = {
  ids: { ulid: () => "gate1" },
  clock: { nowIso: () => "2026-01-01T00:00:01.000Z" },
};

const FLOW_ENGINE_FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../studio-specs/current/fixtures/flow-engine",
);

function loadFlowEngineFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FLOW_ENGINE_FIXTURES, name), "utf-8")) as Record<string, unknown>;
}

describe("flow-engine/checkpoint", () => {
  test("buildCheckpointDispatch resolves assignees and payload_ref templates", () => {
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          assignees: ["{{input.reviewer}}"],
          payload_ref: "{{steps.build.output.artifact_ref}}",
          on_resolve: {
            default: { goto: "done" },
            cancel: { fail: true },
          },
        },
      },
    ]);
    const execContext = {
      input: { reviewer: "alice" },
      steps: { build: { output: { artifact_ref: "art_1" } } },
    };
    const dispatch = buildCheckpointDispatch(ir, 1, execContext);
    expect(dispatch?.step_id).toBe("review");
    expect(dispatch?.assignees).toEqual(["alice"]);
    expect(dispatch?.payload_ref).toBe("art_1");
  });

  test("planOnResolveBranch routes continue + outcome and cancel", () => {
    const onResolve = {
      when: "output.outcome",
      values: {
        validated: { goto: "done" },
        changes_required: { goto: "build" },
      },
      default: { goto: "done" },
      cancel: { fail: true },
    };
    expect(planOnResolveBranch(onResolve, "continue", { outcome: "validated" })?.goto).toBe("done");
    expect(planOnResolveBranch(onResolve, "continue", { outcome: "changes_required" })?.goto).toBe(
      "build",
    );
    expect(planOnResolveBranch(onResolve, "cancel", {})?.fail).toBe(true);
  });

  test("missing on_resolve routes fail checkpoint_routing_missing at runtime", async () => {
    const studio = new MemoryStudioPersistence();
    const handler = {
      appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })),
    };
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: { cancel: { fail: true } },
        },
      },
    ]);
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: { input: {} },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [],
      events: [],
      flows: [
        {
          flow_id: "flw_test",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "test",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          payload_json: JSON.stringify({ flow_id: "flw_test", ir }),
        },
      ],
    });

    const result = await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: handler as never,
        ids: { ulid: () => "gate1" },
        clock: { nowIso: () => "2026-01-01T00:00:01.000Z" },
        dispatchSteps: vi.fn(),
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: { outcome: "validated" },
        actor_id: "alice",
        token_id: "tok_1",
      },
    );
    expect(result.error?.code).toBe("checkpoint_routing_missing");
    const reviewMemo = (await studio.listRunStepMemos("run_run1")).find((m) => m.step_id === "review");
    expect(reviewMemo?.status).toBe("failed");
    expect(reviewMemo?.error_code).toBe("checkpoint_routing_missing");
    const run = await studio.getRun("run1");
    const reviewOutput = (run?.exec_context.steps as Record<string, { output: Record<string, unknown> }>)
      .review.output;
    expect(reviewOutput.outcome).toBe("validated");
    expect(reviewOutput.disposition).toBe("continue");
  });

  test("goto build resets memos and dispatches invoke on loop-back", async () => {
    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: {
            when: "output.outcome",
            values: { changes_required: { goto: "build" } },
            default: { goto: "done" },
            cancel: { fail: true },
          },
        },
      },
      { id: "done", invoke: { space: "spc_x", action: "finish" } },
    ]);
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: { input: {}, steps: { build: { output: { preview_url: "http://x" } } } },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [],
      events: [],
      flows: [
        {
          flow_id: "flw_test",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "test",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          payload_json: JSON.stringify({ flow_id: "flw_test", ir }),
        },
      ],
    });

    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ids: { ulid: () => "gate1" },
        clock: { nowIso: () => "2026-01-01T00:00:01.000Z" },
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: { outcome: "changes_required", comments: ["fix header"] },
        actor_id: "alice",
        token_id: "tok_1",
      },
    );

    const buildMemo = (await studio.listRunStepMemos("run_run1")).find((m) => m.step_id === "build");
    expect(buildMemo?.status).toBe("pending");
    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: "build", action_name: "build" })],
      }),
    );
    const run = await studio.getRun("run1");
    const reviewOutput = (run?.exec_context.steps as Record<string, { output: Record<string, unknown> }>)
      .review.output;
    expect(reviewOutput.outcome).toBe("changes_required");
    expect(reviewOutput.disposition).toBe("continue");
  });

  test("nextCheckpointAfterComplete returns pending gate step", () => {
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
        },
      },
    ]);
    const memos = [
      {
        run_id: "run_1",
        step_id: "build",
        status: "completed" as const,
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const checkpoint = nextCheckpointAfterComplete(memos, ir, { input: {} });
    expect(checkpoint?.step_id).toBe("review");
  });

  test("branch depth guard at CHECKPOINT_BRANCH_MAX_DEPTH", () => {
    expect(CHECKPOINT_BRANCH_MAX_DEPTH).toBe(32);
  });

  test("isDeclarativeCheckpointStep excludes legacy form-only gates", () => {
    const legacyIr = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      { id: "approve", gate: { form: { id: "approval-form" }, assignees: ["alice"] } },
    ]);
    const checkpointIr = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
        },
      },
    ]);
    expect(isDeclarativeCheckpointStep(legacyIr.steps[1])).toBe(false);
    expect(isDeclarativeCheckpointStep(checkpointIr.steps[1])).toBe(true);
  });

  test("legacy form gate resolve sets run working without checkpoint advance", async () => {
    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      { id: "approve", gate: { form: { id: "approval-form" }, assignees: ["alice"] } },
    ]);
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: { input: {} },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await seedFlowIndex(studio, ir);
    await studio.insertGate({
      gate_id: "gate1",
      run_id: "run1",
      session_id: "ses1",
      space_id: "demo",
      step_id: "approve",
      status: "pending",
      assignees: ["alice"],
      resolve_mode: "any_one",
      form: { id: "approval-form" },
      created_at: "2026-01-01T00:00:00.000Z",
    });

    await resolveGateV2(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        gate_id: "gate_gate1",
        decision: "approved",
        actor_id: "alice",
        token_id: "tok_1",
        can_resolve: true,
      },
    );

    const run = await studio.getRun("run1");
    expect(run?.lifecycle).toBe("working");
    expect(dispatchSteps).not.toHaveBeenCalled();
  });

  test("forward goto does not increment checkpoint branch depth", async () => {
    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    const ir = irFrom([
      { id: "build", invoke: { space: "spc_x", action: "build" } },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
        },
      },
      { id: "done", invoke: { space: "spc_x", action: "finish" } },
    ]);
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: { input: {}, _checkpoint_branch_depth: 3 },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:00.000Z",
    });
    await seedFlowIndex(studio, ir);

    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: {},
        actor_id: "alice",
        token_id: "tok_1",
      },
    );

    const run = await studio.getRun("run1");
    expect(run?.exec_context._checkpoint_branch_depth).toBe(3);
    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: "done", action_name: "finish" })],
      }),
    );
  });

  test("isBackwardGoto detects loop-back only", () => {
    expect(isBackwardGoto(2, 0)).toBe(true);
    expect(isBackwardGoto(1, 2)).toBe(false);
    expect(isBackwardGoto(1, 1)).toBe(false);
  });

  test("on_resolve goto start_flow dispatches child flow", async () => {
    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    const childIr = irFrom([{ id: "work", invoke: { space: "spc_x", action: "child-work" } }]);
    const parentIr = compileFlowIr(
      {
        apiVersion: "murrmure.flow/v1",
        name: "parent",
        start: { manual: true },
        steps: [
          {
            id: "review",
            checkpoint: {
              view: "preview-review",
              on_resolve: { default: { goto: "call_child" }, cancel: { fail: true } },
            },
          },
          { id: "call_child", start_flow: { flow_id: "flw_child", input: { topic: "x" }, wait: false } },
        ],
      },
      "flw_parent",
    );
    await studio.insertSession(
      {
        session_id: "ses1",
        title: "test",
        status: "active",
        created_by: "alice",
        spaces_touched: ["demo"],
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [],
      events: [],
      flows: [
        {
          flow_id: "flw_parent",
          origin_space_id: "spc_demo",
          digest: parentIr.digest,
          name: "parent",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir: parentIr,
          payload_json: JSON.stringify({ flow_id: "flw_parent", ir: parentIr }),
        },
        {
          flow_id: "flw_child",
          origin_space_id: "spc_demo",
          digest: childIr.digest,
          name: "child",
          start: { manual: true, flow_call: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir: childIr,
          payload_json: JSON.stringify({ flow_id: "flw_child", ir: childIr }),
        },
      ],
    });
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_parent",
        flow_digest: parentIr.digest,
        lifecycle: "input-required",
        exec_context: { input: {} },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:00.000Z",
    });

    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: {},
        actor_id: "alice",
        token_id: "tok_1",
        capabilities: ["flow:run"],
      },
    );

    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: "work", action_name: "child-work" })],
      }),
    );
    const callChildMemo = (await studio.listRunStepMemos("run_run1")).find(
      (m) => m.step_id === "call_child",
    );
    expect(callChildMemo?.status).toBe("completed");
  });

  test("R4 — gate-loop-on-resolve fixture drives loop-back and build params", async () => {
    const fixture = loadFlowEngineFixture("gate-loop-on-resolve.json");
    const ir = compileFlowIr(fixture.manifest as FlowManifest, "flw_gate_loop");
    const rounds = fixture.rounds as Array<{
      intake_output?: Record<string, unknown>;
      review_output: Record<string, unknown>;
      expect_build_params?: Record<string, unknown>;
      expect_next?: string;
    }>;

    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    await seedFlowIndex(studio, ir, "flw_gate_loop");
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_gate_loop",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: mergeCheckpointOutputIntoInput({ input: {} }, rounds[0]!.intake_output ?? {}),
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "intake",
      status: "completed",
      completed_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:01.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:01.000Z",
    });

    const buildStep = ir.steps.find((s) => s.id === "build");
    let execContext = mergeStepOutputIntoExecContext(
      mergeCheckpointOutputIntoInput({ input: {} }, rounds[0]!.intake_output ?? {}),
      "review",
      {
        status: "completed",
        output: rounds[0]!.review_output,
        completed_at: "2026-01-01T00:00:02.000Z",
      },
    );
    const buildParams = resolveStepParams(buildStep?.invoke?.params, execContext);
    expect(buildParams).toMatchObject(rounds[0]!.expect_build_params ?? {});

    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: rounds[0]!.review_output,
        actor_id: "alice",
        token_id: "tok_1",
      },
    );

    const buildMemo = (await studio.listRunStepMemos("run_run1")).find((m) => m.step_id === "build");
    expect(buildMemo?.status).toBe("pending");
    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: "build", action_name: "run_preview_agent" })],
      }),
    );

    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:03.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:03.000Z",
    });

    dispatchSteps.mockClear();
    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 2, entry_id: "evt_2" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: rounds[1]!.review_output,
        actor_id: "alice",
        token_id: "tok_1",
      },
    );

    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: rounds[1]!.expect_next, action_name: "finish" })],
      }),
    );
  });

  test("R5 — declarative-gate-chain fixture advance sequence", async () => {
    const fixture = loadFlowEngineFixture("declarative-gate-chain.json");
    const ir = compileFlowIr(fixture.manifest as FlowManifest, "flw_chain");
    const expectedSequence = fixture.expected_sequence as string[];
    const sequence: string[] = [];

    const buildDispatch = buildStepDispatch(ir, 0, { input: {} }, "spc_demo");
    expect(buildDispatch?.action_name).toBe("build");
    sequence.push("build.invoke");

    const memosAfterBuild = [
      {
        run_id: "run_1",
        step_id: "build",
        status: "completed" as const,
        completed_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const checkpoint = nextCheckpointAfterComplete(memosAfterBuild, ir, { input: {} });
    expect(checkpoint?.step_id).toBe("review");
    sequence.push("review.checkpoint");

    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    await seedFlowIndex(studio, ir, "flw_chain");
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_chain",
        flow_digest: ir.digest,
        lifecycle: "input-required",
        exec_context: { input: {} },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "build",
      status: "completed",
      completed_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "review",
      status: "working",
      started_at: "2026-01-01T00:00:00.000Z",
    });

    await advanceFlowAfterCheckpointResolve(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        dispatchSteps,
      },
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "review",
        disposition: "continue",
        output: {},
        actor_id: "alice",
        token_id: "tok_1",
      },
    );
    sequence.push("review.resolve.continue");
    expect(dispatchSteps).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatch: [expect.objectContaining({ step_id: "done", action_name: "finish" })],
      }),
    );
    sequence.push("done.invoke");

    expect(sequence).toEqual(expectedSequence);
  });

  test("parallel join advances to checkpoint after matrix completes", async () => {
    const studio = new MemoryStudioPersistence();
    const dispatchSteps = vi.fn();
    const ir = irFrom([
      {
        id: "parallel_dev",
        parallel: {
          matrix: "{{input.items}}",
          lane: [{ id: "dev", invoke: { space: "spc_x", action: "implement" } }],
        },
      },
      {
        id: "review",
        checkpoint: {
          view: "preview-review",
          on_resolve: { default: { goto: "done" }, cancel: { fail: true } },
        },
      },
      { id: "done", invoke: { space: "spc_x", action: "finish" } },
    ]);
    await seedFlowIndex(studio, ir);
    await studio.insertRun(
      {
        run_id: "parent",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: { input: { items: [{ n: 1 }, { n: 2 }] } },
        reference_run_ids: [],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:00.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_parent",
      step_id: "parallel_dev",
      status: "working",
      started_at: "2026-01-01T00:00:00.000Z",
    });
    await studio.insertRun(
      {
        run_id: "lane0",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "completed",
        exec_context: laneExecContext(
          { input: { items: [{ n: 1 }, { n: 2 }] } },
          { n: 1 },
          0,
          "run_parent",
          "parallel_dev",
        ),
        reference_run_ids: ["run_parent"],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:01.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_lane0",
      step_id: "dev",
      status: "completed",
      completed_at: "2026-01-01T00:00:01.000Z",
    });
    await studio.insertRun(
      {
        run_id: "lane1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_test",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: laneExecContext(
          { input: { items: [{ n: 1 }, { n: 2 }] } },
          { n: 2 },
          1,
          "run_parent",
          "parallel_dev",
        ),
        reference_run_ids: ["run_parent"],
        started_at: "2026-01-01T00:00:00.000Z",
      },
      "2026-01-01T00:00:01.000Z",
    );
    await studio.upsertRunStepMemo({
      run_id: "run_lane1",
      step_id: "dev",
      status: "completed",
      completed_at: "2026-01-01T00:00:02.000Z",
    });

    await maybeAdvanceFlow(
      {
        studio,
        handler: { appendSpaceJournal: vi.fn(async () => ({ seq: 1, entry_id: "evt_1" })) } as never,
        ...testDeps,
        ids: { ulid: () => "review_gate" },
        dispatchSteps,
        resolveFlowAuth: vi.fn(async () => ({
          actor_id: "alice",
          token_id: "tok_1",
          capabilities: ["flow:run"],
        })),
      },
      {
        run_id: "run_lane1",
        step_id: "dev",
        actor_id: "alice",
        token_id: "tok_1",
      },
    );

    const gates = await studio.listGatesByRun("parent");
    expect(gates.some((g) => g.step_id === "review")).toBe(true);
    expect(dispatchSteps).not.toHaveBeenCalled();
  });
});
