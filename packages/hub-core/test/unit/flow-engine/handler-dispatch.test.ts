import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { openStepContract } from "../../../src/flow-engine/step-open.js";
import { resolveFlowStep } from "../../../src/flow-engine/step-resolve.js";
import { catalogEntryForStep } from "../../../src/flow-engine/step-catalog.js";

const clock = { nowIso: () => "2026-07-09T10:00:00.000Z" };

const manifest = {
  apiVersion: "murrmure.flow/v1" as const,
  name: "preview-review",
  start: { manual: true },
  steps: [
    {
      id: "intake",
      presentation: { view: "preview-review-intake" },
      branches: {
        continue: { schema: { type: "object" }, next: "write_spec" },
      },
    },
    {
      id: "write_spec",
      role: "agent",
      branches: {
        completed: { schema: { type: "object" }, next: null },
      },
    },
  ],
};

describe("unit/flow-engine/handler-dispatch", () => {
  let studio: MemoryStudioPersistence;
  let dispatchSteps: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    studio = new MemoryStudioPersistence();
    dispatchSteps = vi.fn(async () => undefined);

    const ir = compileFlowIr(manifest, "flw_preview_review");
    const { catalog } = compileStepContractCatalog(manifest, "flw_preview_review");
    if (!catalog) throw new Error("step contract catalog missing");

    await studio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      clock.nowIso(),
    );

    await studio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [
        {
          key: "write-spec",
          digest: "sha256:handlers-vs1",
          payload_json: JSON.stringify({
            id: "write-spec",
            contract_keys: ["preview-review.write_spec", "preview-review.intake"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
            command: "cursor agent -p --force {{prompt}}",
          }),
        },
      ],
      events: [],
      flows: [
        {
          flow_id: "flw_preview_review",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "preview-review",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          step_contract_catalog: catalog,
          payload_json: JSON.stringify({ flow_id: "flw_preview_review", ir, catalog }),
        },
      ],
    });

    await studio.insertSession(
      {
        session_id: "ses1",
        title: "Handler dispatch",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: ["demo"],
        actor_id: "actor_alice",
      },
      clock.nowIso(),
    );
    await studio.insertRun(
      {
        run_id: "run1",
        session_id: "ses1",
        space_id: "demo",
        flow_id: "flw_preview_review",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: clock.nowIso(),
      },
      clock.nowIso(),
    );
  });

  test("dispatches exactly one matched handler for write_spec", async () => {
    const flow = await studio.getFlowIndexEntry("flw_preview_review", "demo");
    const catalog = flow?.step_contract_catalog;
    if (!catalog) throw new Error("catalog missing");
    const entry = catalogEntryForStep(catalog, "write_spec");
    if (!entry) throw new Error("write_spec entry missing");

    await openStepContract(
      {
        studio,
        dispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
        resolveFlowAuth: vi.fn(),
      } as never,
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "write_spec",
        entry,
        exec_context: {},
        actor_id: "actor_alice",
        token_id: "tok_1",
      },
    );

    expect(dispatchSteps).toHaveBeenCalledTimes(1);
    const first = dispatchSteps.mock.calls[0]?.[0];
    expect(first?.dispatch).toHaveLength(1);
    expect(first?.dispatch?.[0]?.action_name).toBe("write-spec");
    expect(first?.dispatch?.[0]?.action_name).not.toBe("legacy_write_spec");
  });

  test("does not dispatch for human step even when key is listed", async () => {
    const flow = await studio.getFlowIndexEntry("flw_preview_review", "demo");
    const catalog = flow?.step_contract_catalog;
    if (!catalog) throw new Error("catalog missing");
    const entry = catalogEntryForStep(catalog, "intake");
    if (!entry) throw new Error("intake entry missing");

    await openStepContract(
      {
        studio,
        dispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
        resolveFlowAuth: vi.fn(),
      } as never,
      {
        run_id: "run_run1",
        session_id: "ses_ses1",
        space_id: "spc_demo",
        step_id: "intake",
        entry,
        exec_context: {},
        actor_id: "actor_alice",
        token_id: "tok_1",
      },
    );

    expect(entry.role).toBe("human");
    expect(dispatchSteps).not.toHaveBeenCalled();
  });

  test("opens write_spec, dispatches once, resolves, and completes run", async () => {
    const localStudio = new MemoryStudioPersistence();
    const localDispatchSteps = vi.fn(async () => undefined);
    const singleStepManifest = {
      apiVersion: "murrmure.flow/v1" as const,
      name: "preview-review",
      start: { manual: true },
      steps: [
        {
          id: "write_spec",
          role: "agent",
          branches: {
            completed: { schema: { type: "object" }, next: null },
          },
        },
      ],
    };
    const ir = compileFlowIr(singleStepManifest, "flw_preview_review_single");
    const { catalog } = compileStepContractCatalog(singleStepManifest, "flw_preview_review_single");
    if (!catalog) throw new Error("single-step catalog missing");

    await localStudio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      clock.nowIso(),
    );
    await localStudio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [
        {
          key: "write-spec",
          digest: "sha256:handlers-vs1",
          payload_json: JSON.stringify({
            id: "write-spec",
            contract_keys: ["preview-review.write_spec"],
            on: "step.opened",
            type: "shell_spawn",
            complete: "explicit",
            command: "cursor agent -p --force {{prompt}}",
          }),
        },
      ],
      events: [],
      flows: [
        {
          flow_id: "flw_preview_review_single",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "preview-review",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          step_contract_catalog: catalog,
          payload_json: JSON.stringify({ flow_id: "flw_preview_review_single", ir, catalog }),
        },
      ],
    });
    await localStudio.insertSession(
      {
        session_id: "ses2",
        title: "Handler dispatch single",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: ["demo"],
        actor_id: "actor_alice",
      },
      clock.nowIso(),
    );
    await localStudio.insertRun(
      {
        run_id: "run2",
        session_id: "ses2",
        space_id: "demo",
        flow_id: "flw_preview_review_single",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: clock.nowIso(),
      },
      clock.nowIso(),
    );

    const entry = catalogEntryForStep(catalog, "write_spec");
    if (!entry) throw new Error("write_spec entry missing");
    const flowDeps = {
      studio: localStudio,
      dispatchSteps: localDispatchSteps,
      clock,
      ids: { ulid: () => "evt_test" },
      handler: { appendSpaceJournal: vi.fn() } as never,
      resolveFlowAuth: vi.fn(),
    } as never;

    await openStepContract(flowDeps, {
      run_id: "run_run2",
      session_id: "ses_ses2",
      space_id: "spc_demo",
      step_id: "write_spec",
      entry,
      exec_context: {},
      actor_id: "actor_alice",
      token_id: "tok_1",
    });

    expect(localDispatchSteps).toHaveBeenCalledTimes(1);
    expect(localDispatchSteps.mock.calls[0]?.[0]?.dispatch?.[0]?.action_name).toBe("write-spec");

    const resolved = await resolveFlowStep(
      {
        studio: localStudio,
        dispatchSteps: localDispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
      } as never,
      {
        run_id: "run_run2",
        step_id: "write_spec",
        body: { branch: "completed", payload: { ok: true } },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses2",
        journal: { append: vi.fn(async () => undefined) },
      },
    );
    expect(resolved.ok).toBe(true);

    const runAfter = await localStudio.getRun("run2");
    expect(runAfter?.lifecycle).toBe("completed");
  });

  test("keeps one owner dispatch across nested build loop iteration", async () => {
    const localStudio = new MemoryStudioPersistence();
    const localDispatchSteps = vi.fn(async () => undefined);
    const nestedManifest = {
      apiVersion: "murrmure.flow/v1" as const,
      name: "preview-review",
      start: { manual: true },
      steps: [
        {
          id: "build",
          role: "agent",
          branches: {
            completed: { schema: { type: "object" }, next: null },
            failed: { schema: { type: "object" }, next: null, fail_run: true },
          },
          steps: [
            {
              id: "build-loop",
              branches: {
                completed: { schema: { type: "object" }, goto: "review" },
                failed: { schema: { type: "object" }, fail: true },
              },
            },
            {
              id: "review",
              presentation: { view: "preview-review" },
              branches: {
                validated: { schema: { type: "object" }, complete: "parent" },
                changes_required: {
                  schema: { type: "object" },
                  continue: "parent",
                  goto: "build-loop",
                },
              },
            },
          ],
        },
      ],
    };
    const ir = compileFlowIr(nestedManifest, "flw_preview_review_nested");
    const { catalog } = compileStepContractCatalog(nestedManifest, "flw_preview_review_nested");
    if (!catalog) throw new Error("nested catalog missing");

    await localStudio.insertSpace(
      { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
      clock.nowIso(),
    );
    await localStudio.replaceSpaceIndex("demo", {
      actions: [],
      executors: [],
      hooks: [
        {
          key: "build-owner",
          digest: "sha256:handlers-vs2",
          payload_json: JSON.stringify({
            id: "build-owner",
            contract_keys: [
              "preview-review.build",
              "preview-review.build.build-loop",
              "preview-review.build.review",
            ],
            on: "step.opened",
            kill_on: "step.resolved",
            type: "shell_spawn",
            complete: "explicit",
            command: "cursor agent -p --force {{prompt}}",
          }),
        },
      ],
      events: [],
      flows: [
        {
          flow_id: "flw_preview_review_nested",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "preview-review",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          step_contract_catalog: catalog,
          payload_json: JSON.stringify({ flow_id: "flw_preview_review_nested", ir, catalog }),
        },
      ],
    });
    await localStudio.insertSession(
      {
        session_id: "ses3",
        title: "Nested owner dispatch",
        status: "active",
        created_by: { type: "actor", actor_id: "actor_alice" },
        spaces_touched: ["demo"],
        actor_id: "actor_alice",
      },
      clock.nowIso(),
    );
    await localStudio.insertRun(
      {
        run_id: "run3",
        session_id: "ses3",
        space_id: "demo",
        flow_id: "flw_preview_review_nested",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: {},
        reference_run_ids: [],
        started_at: clock.nowIso(),
      },
      clock.nowIso(),
    );

    const buildEntry = catalogEntryForStep(catalog, "build");
    if (!buildEntry) throw new Error("build entry missing");
    const flowDeps = {
      studio: localStudio,
      dispatchSteps: localDispatchSteps,
      clock,
      ids: { ulid: () => "evt_test" },
      handler: { appendSpaceJournal: vi.fn() } as never,
      resolveFlowAuth: vi.fn(),
    } as never;
    const journal = { append: vi.fn(async () => undefined) };

    await openStepContract(flowDeps, {
      run_id: "run_run3",
      session_id: "ses_ses3",
      space_id: "spc_demo",
      step_id: "build",
      entry: buildEntry,
      exec_context: {},
      actor_id: "actor_alice",
      token_id: "tok_1",
      journal,
    });

    expect(localDispatchSteps).toHaveBeenCalledTimes(1);
    expect(localDispatchSteps.mock.calls[0]?.[0]?.dispatch?.[0]?.action_name).toBe("build-owner");

    const firstLoopResolved = await resolveFlowStep(
      {
        studio: localStudio,
        dispatchSteps: localDispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
      } as never,
      {
        run_id: "run_run3",
        step_id: "build.build-loop",
        body: { branch: "completed", payload: { ok: true } },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses3",
        journal,
      },
    );
    expect(firstLoopResolved.ok).toBe(true);
    expect(localDispatchSteps).toHaveBeenCalledTimes(1);

    const changesRequired = await resolveFlowStep(
      {
        studio: localStudio,
        dispatchSteps: localDispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
      } as never,
      {
        run_id: "run_run3",
        step_id: "build.review",
        body: { branch: "changes_required", payload: { reason: "fix tests" } },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses3",
        journal,
      },
    );
    expect(changesRequired.ok).toBe(true);
    expect(localDispatchSteps).toHaveBeenCalledTimes(1);

    const secondLoopResolved = await resolveFlowStep(
      {
        studio: localStudio,
        dispatchSteps: localDispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
      } as never,
      {
        run_id: "run_run3",
        step_id: "build.build-loop",
        body: { branch: "completed", payload: { ok: true } },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses3",
        journal,
      },
    );
    expect(secondLoopResolved.ok).toBe(true);

    const validated = await resolveFlowStep(
      {
        studio: localStudio,
        dispatchSteps: localDispatchSteps,
        clock,
        ids: { ulid: () => "evt_test" },
        handler: { appendSpaceJournal: vi.fn() } as never,
      } as never,
      {
        run_id: "run_run3",
        step_id: "build.review",
        body: { branch: "validated", payload: { approved: true } },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses3",
        journal,
      },
    );
    expect(validated.ok).toBe(true);
    expect(localDispatchSteps).toHaveBeenCalledTimes(1);
  });
});
