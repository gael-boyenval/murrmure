import { describe, expect, test } from "vitest";
import {
  buildStepContractSlice,
  buildMurrmurePromptBindings,
  buildInvokeStepContractContext,
  renderAgentStepContractMarkdown,
  renderMurrmureProtocolEnvelope,
  renderThenHint,
  listStepContractsForRun,
  buildInputsFromRun,
  reconstructStepContractFromRelay,
  rebindRemoteMaterializedCopies,
} from "../../../src/flow-engine/step-contract-slice.js";
import { compileStepContractCatalog } from "../../../src/flow-engine/step-contract-compile.js";
import { compileFlowIr } from "../../../src/flow-engine/compile.js";
import type { FlowManifest } from "@murrmure/contracts";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { materializeRemoteArtifactReferences } from "../../../src/flow-engine/consumer-copy.js";
import { consumerInputPath, consumerInputsDirPath } from "../../../src/flow-engine/run-scratch-paths.js";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LINEAR_MANIFEST: FlowManifest = {
  apiVersion: "murrmure.flow/v1",
  name: "preview-review",
  triggers: { manual: true },
  steps: [
    {
      id: "intake",
      description: "Human attaches spec markdown.",
      branches: {
        continue: { schema: { type: "object" }, route: { step: "write_spec" } },
        cancel: { schema: { type: "object" }, route: { run: "failed" } },
      },
    },
    { id: "write_spec", description: "Write the spec." },
    { id: "build", description: "Build the site." },
    { id: "archive", description: "Archive artifacts." },
    { id: "commit", description: "Commit work." },
  ],
};

describe("flow-engine/step-contract-slice", () => {
  test("renderThenHint maps catalog routes to then strings", () => {
    expect(renderThenHint([{ engine: "open", step_id: "write_spec" }])).toBe("engine opens write_spec");
    expect(renderThenHint([{ engine: "fail_run" }])).toBe("fail run");
    expect(renderThenHint([{ engine: "advance" }])).toBe("run completes");
    expect(renderThenHint([{ engine: "resume", step_id: "build" }])).toBe("resume build");
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
    expect(slice.workdir).toBe(".mrmr/dev/runs/run_01TEST/steps/intake/work");
    expect(slice.branches.continue?.then).toBe("engine opens write_spec");
    expect(slice.branches.cancel?.then).toBe("fail run");
    expect(slice.inputs_from_run).toEqual({ spec_filename: "demo.md" });
  });

  test("buildStepContractSlice for default branches renders terminal success on last step", () => {
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const commit = catalog!.entries.find((e) => e.step_id === "commit")!;
    const slice = buildStepContractSlice({
      entry: commit,
      exec_context: {},
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });
    expect(slice.branches.completed?.then).toBe("run completes");
    expect(slice.branches.failed?.then).toBe("fail run");
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
    const md = renderAgentStepContractMarkdown(slice, { run_id: "run_01TEST" });
    expect(md).toContain("### Active step: build");
    expect(md).toContain('run_id: "run_01TEST"');
    expect(md).toContain('step_id: "build"');
    expect(md).toContain('branch: "completed"');
    expect(md).toContain('"$schema":"https://json-schema.org/draft/2020-12/schema"');
    expect(md).not.toContain("<run_id>");
    expect(md).not.toContain("When ready:");
    expect(md).toContain("Then: engine opens archive");
  });

  test("resumed parent prompt exposes declared children and canonical return context", () => {
    const manifest: FlowManifest = {
      apiVersion: "murrmure.flow/v1",
      name: "nested",
      triggers: { manual: true },
      steps: [{
        id: "build",
        steps: [{ id: "review" }, { id: "build-loop" }],
      }],
    };
    const { catalog } = compileStepContractCatalog(manifest, "flw_nested");
    const build = catalog!.entries.find((entry) => entry.step_id === "build")!;
    const returnedChild = {
      step_id: "build.review",
      branch: "changes_required",
      iteration: 2,
      payload: { comments: ["Fix contrast"] },
      artifacts_out: [{ slot: "report", files: [] }],
    };
    const slice = buildStepContractSlice({
      entry: build,
      catalog: catalog!,
      exec_context: {
        _step_assignment_reasons: { build: "resumed" },
        _returned_children: { build: returnedChild },
      },
      run_id: "run_01NESTED",
      space_root: "/tmp/space",
    });
    expect(slice).toMatchObject({
      reason: "resumed",
      declared_children: ["build.review", "build.build-loop"],
      returned_child: returnedChild,
    });
    const markdown = renderAgentStepContractMarkdown(slice, { run_id: "run_01NESTED" });
    expect(markdown).toContain("Assignment reason: resumed");
    expect(markdown).toContain("murrmure_open_child_step");
    expect(markdown).toContain('parent_step_id: "build"');
    expect(markdown).toContain("Returned child:");
    expect(markdown).toContain("changes_required");
  });

  test("renders deterministic branch-neutral payload and artifact contracts", () => {
    const slice = {
      step_id: "build",
      parent_id: null,
      branches: {
        z_custom: {
          schema: {
            type: "object",
            required: ["description", "bundle"],
            properties: { description: { type: "string" } },
          },
          payload_required: ["description"],
          artifact_required: ["bundle"],
          artifact_slots: { bundle: { max_files: 1, extensions: [".zip"] } },
          then: "engine advances",
        },
        cancel: {
          schema: { type: "object" },
          payload_required: [],
          artifact_required: [],
          artifact_slots: {},
          then: "fail run",
        },
      },
      inputs_from_run: {},
    };
    const local = renderAgentStepContractMarkdown(slice, {
      run_id: "01LIVE",
      artifact_transport: "local_path",
    });
    expect(local.indexOf("Branch `cancel`")).toBeLessThan(local.indexOf("Branch `z_custom`"));
    expect(local).toContain('payload: {"description":"value"}');
    expect(local).not.toContain('"required":["bundle","description"]');
    expect(local).toContain('"bundle":{"extensions":[".zip"],"max_files":1,"min_files":1,"required":true}');
    expect(local).toContain('artifacts_out: [{ slot: "bundle", path: "bundle.zip" }]');

    const remote = renderAgentStepContractMarkdown(slice, {
      run_id: "01LIVE",
      artifact_transport: "remote_reference",
    });
    expect(remote).toContain('upload_intent_id: "upi_authorized_artifact_reference"');
    expect(remote).not.toContain("artifacts_out:");
  });

  test("protocol v1 omits discovery for one key and gates it for many", () => {
    const single = renderMurrmureProtocolEnvelope({
      run_id: "run_01LIVE",
      contract_markdown: "### Active step: build",
      contract_key_count: 1,
    });
    expect(single.startsWith("Protocol: murrmure.agent/v1\n")).toBe(true);
    expect(single).not.toContain("## Session");
    expect(single).not.toContain("## MCP tools");
    expect(single).not.toContain("## Resolve API");
    expect(single).not.toContain("## Discovery");

    const multiple = renderMurrmureProtocolEnvelope({
      run_id: "run_01LIVE",
      contract_markdown: "### Active step: build",
      contract_key_count: 2,
    });
    expect(multiple).toContain("## Discovery");
    expect(multiple).toContain('murrmure_list_step_contracts({ run_id: "run_01LIVE" })');
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

  test("buildMurrmurePromptBindings exposes artifact path tokens", () => {
    const exec_context = {
      artifacts: {
        intake: {
          spec: {
            slot: "spec",
            cardinality: "singleton",
            files: [{
              path: ".mrmr/dev/runs/run_01TEST/steps/intake/spec/x.md",
              name: "x.md",
              transfer_id: "xfr_01",
            }],
          },
        },
      },
    };
    const { catalog } = compileStepContractCatalog(LINEAR_MANIFEST, "flw_preview_review");
    const build = catalog!.entries.find((e) => e.step_id === "build")!;
    const slice = buildStepContractSlice({
      entry: build,
      exec_context,
      run_id: "run_01TEST",
      space_root: "/tmp/space",
    });
    const bindings = buildMurrmurePromptBindings({
      slice,
      space_root: "/tmp/space",
      run_id: "run_01TEST",
      exec_context,
    });
    expect(bindings["step.intake.artifact.spec.path"]).toContain("intake/spec/x.md");
    expect(bindings["step.intake.artifact.spec.transfer_id"]).toBe("xfr_01");
    expect(slice.inputs_from_run["steps.intake.artifact.spec.path"]).toContain("intake/spec/x.md");
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
    expect(ctx.contract_path).toBe("/tmp/space/.mrmr/dev/runs/run_01TEST/active-step-contract.json");
    expect(ctx.workdir).toBe("/tmp/space/.mrmr/dev/runs/run_01TEST/steps/build/work");
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
          triggers: { manual: true },
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
      status: "working",
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

  test("resolveInvokeContractStepId prefers active nested child over parent executor", async () => {
    const { resolveInvokeContractStepId } = await import(
      "../../../src/flow-engine/step-contract-slice.js"
    );
    const memos = [
      { run_id: "run_1", step_id: "build", status: "working" as const },
      { run_id: "run_1", step_id: "build.build-loop", status: "working" as const },
    ];
    expect(resolveInvokeContractStepId("build", memos)).toBe("build.build-loop");
    expect(resolveInvokeContractStepId("write_spec", memos)).toBe("write_spec");
  });
});

describe("flow-engine/step-contract-slice — remote relay rebind", () => {
  function digestOf(content: string): string {
    return "sha256:" + createHash("sha256").update(content).digest("hex");
  }

  /** A reference-only relay mirroring what a peer hub sends (no producer paths). */
  function collectionRelay() {
    const a = '{"openapi":"3.0"}\n';
    const b = "# snapshot\n";
    return {
      slice: {
        step_id: "build",
        branches: {
          completed: {
            payload_required: [],
            artifact_required: [],
            artifact_slots: {},
            then: "engine.advances",
          },
        },
        inputs_from_run: {},
      },
      run_artifacts: {
        intake: {
          assets: {
            slot: "assets",
            cardinality: "collection",
            files: [
              { name: "01-openapi.json", transfer_id: "xfr_a", digest: digestOf(a), size_bytes: a.length },
              { name: "02-snapshot.md", transfer_id: "xfr_b", digest: digestOf(b), size_bytes: b.length },
            ],
          },
        },
      },
      artifact_references: [
        {
          producer_step: "intake",
          slot: "assets",
          cardinality: "collection",
          files: [
            { name: "01-openapi.json", transfer_id: "xfr_a", digest: digestOf(a), size_bytes: a.length },
            { name: "02-snapshot.md", transfer_id: "xfr_b", digest: digestOf(b), size_bytes: b.length },
          ],
        },
      ],
      contract_key_count: 2,
      hub_token: "tok_origin",
      hub_url: "http://127.0.0.1:9999",
    };
  }

  test("rebind folds verified destination consumer copies into the contract + bindings", async () => {
    const spaceRoot = mkdtempSync(join(tmpdir(), "rebind-full-"));
    try {
      const relay = collectionRelay() as never;
      const a = '{"openapi":"3.0"}\n';
      const b = "# snapshot\n";
      const reconstructed = await reconstructStepContractFromRelay(relay, {
        space_root: spaceRoot,
        run_id: "run_01TEST",
        step_id: "build",
      });

      // Reference-only reconstruction carries no producer `path`.
      const beforeBag = JSON.parse(reconstructed.run_artifacts_json!) as Record<
        string,
        Record<string, { files: Array<Record<string, unknown>> }>
      >;
      expect(beforeBag.intake.assets.files.every((f) => f.path === undefined)).toBe(true);

      const materialized = await materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "run_01TEST",
        consumer_step: "build",
        references: relay.artifact_references,
        loadBytes: async (transfer_id) =>
          transfer_id === "xfr_a"
            ? { bytes: Buffer.from(a), digest: digestOf(a) }
            : { bytes: Buffer.from(b), digest: digestOf(b) },
      });

      const rebounded = rebindRemoteMaterializedCopies({
        stepContract: reconstructed,
        space_root: spaceRoot,
        run_id: "run_01TEST",
        materialized,
      });

      const bag = JSON.parse(rebounded.run_artifacts_json!) as Record<
        string,
        Record<string, { files: Array<{ name: string; path?: string }> }>
      >;
      const expectedRelA = join(".mrmr", "dev", "runs", "run_01TEST", "steps", "build", "inputs", "assets", "01-openapi.json");
      const expectedRelB = join(".mrmr", "dev", "runs", "run_01TEST", "steps", "build", "inputs", "assets", "02-snapshot.md");
      expect(bag.intake.assets.files[0]!.path).toBe(expectedRelA);
      expect(bag.intake.assets.files[1]!.path).toBe(expectedRelB);
      // Verified consumer copies exist on disk at the rebound paths.
      expect(existsSync(join(spaceRoot, expectedRelA))).toBe(true);
      expect(existsSync(join(spaceRoot, expectedRelB))).toBe(true);
      expect(readFileSync(join(spaceRoot, expectedRelA), "utf8")).toBe(a);
      expect(readFileSync(join(spaceRoot, expectedRelB), "utf8")).toBe(b);

      // Prompt bindings now expose the destination `.directory` for the slot,
      // pointing at the destination consumer inputs dir (no producer path).
      const dirBinding = rebounded.prompt_bindings["step.intake.artifact.assets.directory"];
      expect(typeof dirBinding).toBe("string");
      expect(dirBinding).toBe(
        join(".mrmr", "dev", "runs", "run_01TEST", "steps", "build", "inputs", "assets"),
      );
      const bindingsBlob = JSON.stringify(rebounded.prompt_bindings);
      expect(bindingsBlob).not.toContain("run_prod");
      expect(bindingsBlob).not.toContain("steps/intake/assets");
    } finally {
      rmSync(spaceRoot, { recursive: true, force: true });
    }
  });

  test("rebind leaves unmaterialized references path-less (typed missing-binding, no producer path)", async () => {
    const spaceRoot = mkdtempSync(join(tmpdir(), "rebind-partial-"));
    try {
      const relay = collectionRelay() as never;
      const a = '{"openapi":"3.0"}\n';
      const reconstructed = await reconstructStepContractFromRelay(relay, {
        space_root: spaceRoot,
        run_id: "run_01TEST",
        step_id: "build",
      });

      // Only `xfr_a` has local bytes; `xfr_b` is absent (peer must fetch it).
      const materialized = await materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "run_01TEST",
        consumer_step: "build",
        references: relay.artifact_references,
        loadBytes: async (transfer_id) =>
          transfer_id === "xfr_a" ? { bytes: Buffer.from(a), digest: digestOf(a) } : null,
      });
      expect(materialized[0]!.files.map((f) => f.name)).toEqual(["01-openapi.json"]);

      const rebounded = rebindRemoteMaterializedCopies({
        stepContract: reconstructed,
        space_root: spaceRoot,
        run_id: "run_01TEST",
        materialized,
      });

      const bag = JSON.parse(rebounded.run_artifacts_json!) as Record<
        string,
        Record<string, { files: Array<{ name: string; path?: string }> }>
      >;
      expect(bag.intake.assets.files[0]!.path).toBeDefined();
      // The unmaterialized file retains no `path` — a handler must fetch it via
      // the relayed `hub_token` / `hub_url`; `materializeArtifactBindings` will
      // emit a typed missing-binding rather than bind a producer path.
      expect(bag.intake.assets.files[1]!.path).toBeUndefined();
      const blob = JSON.stringify(rebounded.run_artifacts_json);
      expect(blob).not.toContain("run_prod");
      expect(blob).not.toContain("steps/intake/assets");
    } finally {
      rmSync(spaceRoot, { recursive: true, force: true });
    }
  });

  test("materializeRemoteArtifactReferences is reachable from local bytes and skips absent ones", async () => {
    const spaceRoot = mkdtempSync(join(tmpdir(), "rebind-reach-"));
    try {
      const a = '{"openapi":"3.0"}\n';
      const slot = await materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "run_01TEST",
        consumer_step: "build",
        references: [
          {
            producer_step: "intake",
            slot: "assets",
            cardinality: "collection",
            files: [{ name: "01-openapi.json", transfer_id: "xfr_a", digest: digestOf(a), size_bytes: a.length }],
          },
        ],
        loadBytes: async () => ({ bytes: Buffer.from(a), digest: digestOf(a) }),
      });
      expect(slot).toHaveLength(1);
      expect(slot[0]!.files).toHaveLength(1);
      expect(slot[0]!.files[0]!.path).toBe(
        consumerInputPath(spaceRoot, "run_01TEST", "build", "assets", "01-openapi.json"),
      );
      expect(slot[0]!.directory).toBe(
        consumerInputsDirPath(spaceRoot, "run_01TEST", "build", "assets"),
      );
      expect(existsSync(slot[0]!.files[0]!.path)).toBe(true);

      // Absent bytes are skipped (no path), never throwing — the relay handler
      // remains reachable and fetches them via `hub_token` / `hub_url`.
      const skipped = await materializeRemoteArtifactReferences({
        space_root: spaceRoot,
        run_id: "run_01TEST",
        consumer_step: "build",
        references: [
          {
            producer_step: "intake",
            slot: "assets",
            cardinality: "collection",
            files: [{ name: "02-snapshot.md", transfer_id: "xfr_missing", digest: digestOf("x"), size_bytes: 1 }],
          },
        ],
        loadBytes: async () => null,
      });
      expect(skipped[0]!.files).toEqual([]);
    } finally {
      rmSync(spaceRoot, { recursive: true, force: true });
    }
  });
});
