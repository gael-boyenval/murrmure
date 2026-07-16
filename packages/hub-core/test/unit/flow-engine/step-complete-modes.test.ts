import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { maybeAutoResolveExecutorStepAfterAction } from "../../../src/flow-engine/step-resolve.js";
import type { HubHandler } from "../../../src/handlers/hub.js";

const clock = { nowIso: () => "2026-07-09T12:00:00.000Z" };

async function seedFlowRun(input: {
  studio: MemoryStudioPersistence;
  flow_id: string;
  run_id: string;
  session_id: string;
  manifest: {
    apiVersion: "murrmure.flow/v1";
    name: string;
    start: { manual: true };
    steps: Array<Record<string, unknown>>;
  };
  open_step_id: string;
}) {
  const ir = compileFlowIr(input.manifest, input.flow_id);
  const { catalog } = compileStepContractCatalog(input.manifest, input.flow_id);
  if (!catalog) throw new Error("catalog missing");

  await input.studio.insertSpace(
    { space_id: "demo", slug: "demo", name: "Demo", status: "active", members: [] },
    clock.nowIso(),
  );
  await input.studio.replaceSpaceIndex("demo", {
    actions: [],
    executors: [],
    hooks: [],
    events: [],
    flows: [
      {
        flow_id: input.flow_id,
        origin_space_id: "spc_demo",
        digest: ir.digest,
        name: input.manifest.name,
        start: { manual: true },
        step_spaces: ["spc_demo"],
        grants_required: [],
        ir,
        step_contract_catalog: catalog,
        payload_json: JSON.stringify({ flow_id: input.flow_id, ir, catalog }),
      },
    ],
  });
  await input.studio.insertSession(
    {
      session_id: input.session_id.replace(/^ses_/, ""),
      title: "Step complete modes",
      status: "active",
      created_by: { type: "actor", actor_id: "actor_alice" },
      spaces_touched: ["demo"],
      actor_id: "actor_alice",
    },
    clock.nowIso(),
  );
  await input.studio.insertRun(
    {
      run_id: input.run_id.replace(/^run_/, ""),
      session_id: input.session_id.replace(/^ses_/, ""),
      space_id: "demo",
      flow_id: input.flow_id,
      flow_digest: ir.digest,
      lifecycle: "working",
      exec_context: {},
      reference_run_ids: [],
      started_at: clock.nowIso(),
    },
    clock.nowIso(),
  );
  await input.studio.upsertRunStepMemo({
    run_id: input.run_id,
    step_id: input.open_step_id,
    status: "working",
    started_at: clock.nowIso(),
  });
  return catalog;
}

describe("unit/flow-engine/step-complete-modes", () => {
  let studio: MemoryStudioPersistence;
  let handler: HubHandler;

  beforeEach(() => {
    studio = new MemoryStudioPersistence();
    handler = { appendSpaceJournal: vi.fn(async () => undefined) } as unknown as HubHandler;
  });

  function deps() {
    return {
      studio,
      handler,
      ids: { ulid: () => "evt_test" },
      clock,
      dispatchSteps: vi.fn(async () => undefined),
      cancelTimeoutMs: 10_000,
      executorPollStore: {
        deleteOffered: vi.fn(),
        extendOfferedDeadlinesForRun: vi.fn(),
        cancelOfferedForRun: vi.fn(),
      } as never,
    };
  }

  test("auto mode resolves step on successful shell result", async () => {
    const catalog = await seedFlowRun({
      studio,
      flow_id: "flw_auto",
      run_id: "run_run1",
      session_id: "ses_ses1",
      open_step_id: "write_spec",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "preview-review",
        start: { manual: true },
        steps: [
          {
            id: "write_spec",
            role: "agent",
            branches: {
              completed: { schema: { type: "object" }, next: null },
              failed: { schema: { type: "object" }, fail_run: true },
            },
          },
        ],
      },
    });

    const resolved = await maybeAutoResolveExecutorStepAfterAction(deps() as never, {
      run_id: "run_run1",
      step_id: "write_spec",
      result: { ok: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses1",
      catalog,
      complete_mode: "auto",
      journal: { append: vi.fn(async () => undefined) },
    });

    expect(resolved).toBe(true);
    const memo = (await studio.listRunStepMemos("run_run1")).find((m) => m.step_id === "write_spec");
    expect(memo?.status).toBe("completed");
  });

  test("cli mode does not auto-resolve", async () => {
    const catalog = await seedFlowRun({
      studio,
      flow_id: "flw_cli",
      run_id: "run_run2",
      session_id: "ses_ses2",
      open_step_id: "write_spec",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "preview-review",
        start: { manual: true },
        steps: [
          {
            id: "write_spec",
            role: "agent",
            branches: {
              completed: { schema: { type: "object" }, next: null },
              failed: { schema: { type: "object" }, fail_run: true },
            },
          },
        ],
      },
    });

    const resolved = await maybeAutoResolveExecutorStepAfterAction(deps() as never, {
      run_id: "run_run2",
      step_id: "write_spec",
      result: { ok: true },
      actor_id: "actor_alice",
      token_id: "tok_1",
      space_id: "spc_demo",
      session_id: "ses_ses2",
      catalog,
      complete_mode: "cli",
      journal: { append: vi.fn(async () => undefined) },
    });

    expect(resolved).toBe(false);
    const memo = (await studio.listRunStepMemos("run_run2")).find((m) => m.step_id === "write_spec");
    expect(memo?.status).toBe("working");
  });

  test("auto mode rejects nested parent steps at runtime", async () => {
    const catalog = await seedFlowRun({
      studio,
      flow_id: "flw_nested",
      run_id: "run_run3",
      session_id: "ses_ses3",
      open_step_id: "build",
      manifest: {
        apiVersion: "murrmure.flow/v1",
        name: "preview-review",
        start: { manual: true },
        steps: [
          {
            id: "build",
            role: "agent",
            branches: {
              completed: { schema: { type: "object" }, next: null },
            },
            steps: [
              {
                id: "build-loop",
                role: "agent",
                branches: {
                  completed: { schema: { type: "object" }, complete: "parent" },
                },
              },
            ],
          },
        ],
      },
    });

    await expect(
      maybeAutoResolveExecutorStepAfterAction(deps() as never, {
        run_id: "run_run3",
        step_id: "build",
        result: { ok: true },
        actor_id: "actor_alice",
        token_id: "tok_1",
        space_id: "spc_demo",
        session_id: "ses_ses3",
        catalog,
        complete_mode: "auto",
        journal: { append: vi.fn(async () => undefined) },
      }),
    ).rejects.toThrow("HANDLER_COMPLETE_AUTO_NESTED");
  });
});
