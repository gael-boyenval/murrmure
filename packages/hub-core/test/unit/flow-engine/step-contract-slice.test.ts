import { describe, expect, test } from "vitest";
import {
  buildStepContractSlice,
  buildMurrmurePromptBindings,
  buildInvokeStepContractContext,
  renderAgentStepContractMarkdown,
  renderThenHint,
  listStepContractsForRun,
  buildInputsFromRun,
} from "../../../src/flow-engine/step-contract-slice.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import type { FlowManifest } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";

const LINEAR_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "preview-review-v2",
  start: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches spec markdown.",
      presentation: { view: "preview-review-intake" },
      branches: {
        continue: { schema: { type: "object" }, next: "write_spec" },
        cancel: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "write_spec",
      executor: {
        action: "feature_write_spec",
        params: { spec_filename: "{{input.spec_filename}}" },
      },
      branches: {
        completed: { schema: { type: "object" }, next: "build" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "build",
      orchestration: "engine-routed",
      executor: {
        action: "feature_build",
        params: { spec_filename: "{{input.spec_filename}}" },
      },
      branches: {
        completed: { schema: { type: "object" }, next: "archive" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "archive",
      executor: { action: "feature_archive" },
      branches: {
        completed: { schema: { type: "object" }, next: "commit" },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
    {
      id: "commit",
      executor: { action: "feature_commit" },
      branches: {
        completed: { schema: { type: "object" }, next: null },
        failed: { schema: { type: "object" }, next: null, fail_run: true },
      },
    },
  ],
};

describe("flow-engine/step-contract-slice", () => {
  test("renderThenHint maps catalog routes to then strings", () => {
    expect(renderThenHint([{ engine: "open", step_id: "write_spec" }])).toBe("engine opens write_spec");
    expect(renderThenHint([{ engine: "fail_run", fail_run: true }])).toBe("fail run");
    expect(renderThenHint([{ engine: "advance" }])).toBe("run completes");
    expect(
      renderThenHint([
        { engine: "continue_parent" },
        { engine: "goto", step_id: "build.build-loop" },
      ]),
    ).toBe("continue parent; engine opens build.build-loop");
  });

  test("buildStepContractSlice includes then hints and workdir", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const intake = catalog!.entries.find((e) => e.step_id === "intake")!;
    const slice = buildStepContractSlice({
      entry: intake,
      exec_context: { input: { spec_filename: "demo.md" } },
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });

    expect(slice.step_id).toBe("intake");
    expect(slice.role).toBe("human");
    expect(slice.workdir).toBe(".mrmr.temp/runs/run_01TEST/steps/intake/work");
    expect(slice.branches.continue?.then).toBe("engine opens write_spec");
    expect(slice.branches.cancel?.then).toBe("fail run");
    expect(slice.inputs_from_run).toEqual({ spec_filename: "demo.md" });
  });

  test("renderAgentStepContractMarkdown includes resolve_step guidance", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const build = catalog!.entries.find((e) => e.step_id === "build")!;
    const slice = buildStepContractSlice({
      entry: build,
      exec_context: {},
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });
    const md = renderAgentStepContractMarkdown(slice);
    expect(md).toContain("## Active step: build");
    expect(md).toContain('murrmure_resolve_step({ step_id: "build", branch: "completed"');
    expect(md).toContain("Then: engine opens archive");
  });

  test("buildMurrmurePromptBindings exposes composite and atomic tokens", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const build = catalog!.entries.find((e) => e.step_id === "build")!;
    const slice = buildStepContractSlice({
      entry: build,
      exec_context: { input: { spec_filename: "x.md" } },
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });
    const bindings = buildMurrmurePromptBindings({
      slice,
      space_root: "/tmp/space",
      run_id: "run_01TEST",
    });
    expect(bindings.run_id).toBe("run_01TEST");
    expect(bindings.space_root).toBe("/tmp/space");
    expect(bindings.agentStepContract).toContain("Active step: build");
    expect(JSON.parse(bindings["inputs.json"])).toEqual({ spec_filename: "x.md" });
  });

  test("buildInvokeStepContractContext wires env and path fields", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const build = catalog!.entries.find((e) => e.step_id === "build")!;
    const slice = buildStepContractSlice({
      entry: build,
      exec_context: {},
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });
    const ctx = buildInvokeStepContractContext({
      slice,
      space_root: "/tmp/space",
      run_id: "run_01TEST",
    });
    expect(ctx.contract_path).toBe("/tmp/space/.mrmr.temp/runs/run_01TEST/active-step-contract.json");
    expect(ctx.workdir).toBe("/tmp/space/.mrmr.temp/runs/run_01TEST/steps/build/work");
    expect(JSON.parse(ctx.slice_json).step_id).toBe("build");
    expect(ctx.prompt_bindings.agentStepContract).toContain("build");
  });

  test("buildInputsFromRun merges input bag and prior step outputs", () => {
    const inputs = buildInputsFromRun({
      input: { reviewer: "alice" },
      steps: {
        intake: { output: { spec_filename: "demo.md" } },
      },
    });
    expect(inputs.reviewer).toBe("alice");
    expect(inputs["steps.intake.output"]).toEqual({ spec_filename: "demo.md" });
  });

  test("listStepContractsForRun returns active slice for working step", async () => {
    const studio = new MemoryStudioPersistence();
    const clock = { nowIso: () => "2026-01-01T00:00:00.000Z" };
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const ir = compileFlowIr(LINEAR_MANIFEST, "flw_preview_review");

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
          flow_id: "flw_preview_review",
          origin_space_id: "spc_demo",
          digest: ir.digest,
          name: "preview-review",
          start: { manual: true },
          step_spaces: ["spc_demo"],
          grants_required: [],
          ir,
          step_contract_catalog: catalog!,
          payload_json: JSON.stringify({ flow_id: "flw_preview_review", ir, catalog }),
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
        flow_id: "flw_preview_review",
        flow_digest: ir.digest,
        lifecycle: "working",
        exec_context: { input: { spec_filename: "demo.md" } },
        reference_run_ids: [],
        started_at: clock.nowIso(),
      },
      clock.nowIso(),
    );
    await studio.upsertRunStepMemo({
      run_id: "run_run1",
      step_id: "intake",
      status: "awaiting_human",
      started_at: clock.nowIso(),
    });

    const result = await listStepContractsForRun(studio, "run_run1", "/tmp/space");
    expect("code" in result).toBe(false);
    if ("code" in result) return;
    expect(result.run_id).toBe("run_run1");
    expect(result.active?.step_id).toBe("intake");
    expect(result.graph_digest).toBe(catalog!.graph_digest);
    expect(result.callable).toEqual([]);
  });
});
