import { describe, expect, test } from "vitest";
import { createRemoteHubExecutor, type RemoteHubRelayInput } from "../src/remote-hub.js";
import type {
  DispatchContext,
  InvokeRequest,
  InvokeStepContractContext,
} from "@murrmure/runtime-contracts";

/**
 * Producer step contract that deliberately carries host and run-scratch paths:
 * `contract_path`, `workdir`, `prompt_bindings` (`.path` / `.directory` /
 * `workdir`), a slice with `workdir` and `inputs_from_run` `.path` /
 * `.directory` keys, and a run artifacts bag whose files carry producer
 * `.mrmr/dev/runs/...` `path` values. None of these may cross the federation
 * boundary; only ordered references (`transfer_id` / `digest` / `name` /
 * `size_bytes`) and the sanitized slice may be relayed.
 */
function producerStepContract(): InvokeStepContractContext {
  const slice = {
    step_id: "build",
    workdir: ".mrmr/dev/runs/run_42/build",
    branches: {
      completed: {
        payload_required: [],
        artifact_required: [],
        artifact_slots: {},
        then: "engine.advances",
      },
    },
    inputs_from_run: {
      "steps.review.artifact.spec.path": "/tmp/producer/.mrmr/dev/runs/run_42/spec/spec.md",
      "steps.review.artifact.spec.directory": ".mrmr/dev/runs/run_42/spec",
      "steps.review.artifact.spec.transfer_id": "ti_spec",
      "steps.review.artifact.spec.name": "spec.md",
      "steps.review.artifact.spec.digest": "sha256:spec",
      "steps.review.artifact.spec.size_bytes": 12,
      "steps.review.artifact.chunks.files": [
        { name: "a.txt", transfer_id: "ti_a", digest: "sha256:a", size_bytes: 3 },
        { name: "b.txt", transfer_id: "ti_b", digest: "sha256:b", size_bytes: 3 },
      ],
      "steps.review.artifact.chunks.transfer_ids": ["ti_a", "ti_b"],
      "inputs.owner": "alice",
    },
  };
  const runArtifacts = {
    review: {
      spec: {
        slot: "spec",
        cardinality: "singleton",
        files: [
          {
            name: "spec.md",
            path: "/tmp/producer/.mrmr/dev/runs/run_42/spec/spec.md",
            transfer_id: "ti_spec",
            digest: "sha256:spec",
            size_bytes: 12,
          },
        ],
      },
      chunks: {
        slot: "chunks",
        cardinality: "collection",
        files: [
          {
            name: "a.txt",
            path: "/tmp/producer/.mrmr/dev/runs/run_42/chunks/a.txt",
            transfer_id: "ti_a",
            digest: "sha256:a",
            size_bytes: 3,
          },
          {
            name: "b.txt",
            path: "/tmp/producer/.mrmr/dev/runs/run_42/chunks/b.txt",
            transfer_id: "ti_b",
            digest: "sha256:b",
            size_bytes: 3,
          },
        ],
      },
    },
  };
  return {
    slice_json: JSON.stringify(slice),
    contract_path: "/tmp/producer/.mrmr/dev/runs/run_42/active-step-contract.json",
    workdir: "/tmp/producer/.mrmr/dev/runs/run_42/build",
    prompt_bindings: {
      run_id: "run_42",
      space_root: "/tmp/producer",
      agentStepContract: "### Active step: build",
      "inputs.json": JSON.stringify(slice.inputs_from_run),
      "step.build.workdir": ".mrmr/dev/runs/run_42/build",
      "step.review.artifact.spec.path": "/tmp/producer/.mrmr/dev/runs/run_42/spec/spec.md",
      "step.review.artifact.chunks.directory": ".mrmr/dev/runs/run_42/chunks",
    },
    run_artifacts_json: JSON.stringify(runArtifacts),
    contract_key_count: 2,
    hub_token: "tok_origin",
    hub_url: "http://127.0.0.1:9999",
  };
}

describe("remote-hub relay outbound body", () => {
  test("relays sanitized step contract + ordered artifact references with no host paths", async () => {
    let captured: RemoteHubRelayInput | undefined;
    const executor = createRemoteHubExecutor({
      checkPeerHealth: async () => ({ status: "reachable" }),
      relayInvoke: async (input) => {
        captured = input;
        return {
          ok: true,
          http_status: 200,
          dispatch: { status: "dispatched", run_id: "run_42", step_id: "build" },
        };
      },
      sleep: async () => undefined,
    });

    const invoke: InvokeRequest = {
      space_id: "spc_virtual",
      action_name: "build",
      session_id: "ses_1",
      run_id: "run_42",
      step_id: "build",
      params: {
        message: "hello-federation",
        artifacts: [
          {
            name: "spec.md",
            transfer_id: "ti_spec",
            local_path: "/tmp/producer/.mrmr/dev/inbox/spec.md",
          },
        ],
      },
      exec_input: { owner: "alice" },
      expect: { response_schema: "murrmure:result/v1:ok" },
      artifacts_in: ["ti_spec"],
      delivery: "fail_fast",
    };
    const context: DispatchContext = {
      action: { name: "build" },
      binding: {
        type: "remote_hub",
        executor_id: "remote-exec",
        remote_hub_id: "hub_b",
        remote_space_id: "spc_remote",
      },
      space_root: "/tmp/producer",
      exec_input: { owner: "alice" },
      step_contract: producerStepContract(),
    };

    const outcome = await executor.dispatch(invoke, context);
    expect(outcome.status).toBe("dispatched");
    expect(captured).toBeDefined();
    const body = captured!.body;
    const bodyStr = JSON.stringify(body);

    // Core relay fields are present.
    expect(body.run_id).toBe("run_42");
    expect(body.step_id).toBe("build");
    expect(body.artifacts_in).toEqual(["ti_spec"]);
    expect(body.delivery).toBe("fail_fast");
    expect(body.exec_input).toEqual({ owner: "alice" });

    // Non-artifact params preserved; producer local_path stripped from artifacts.
    const params = body.params as Record<string, unknown>;
    expect(params.message).toBe("hello-federation");
    const relayedArtifacts = params.artifacts as Array<Record<string, unknown>>;
    expect(relayedArtifacts[0]!.local_path).toBeUndefined();
    expect(relayedArtifacts[0]!.transfer_id).toBe("ti_spec");

    // Sanitized step contract relayed.
    expect(body.step_contract).toBeDefined();
    const relay = body.step_contract as Record<string, unknown>;
    expect(relay.contract_key_count).toBe(2);
    expect(relay.hub_token).toBe("tok_origin");
    expect(relay.hub_url).toBe("http://127.0.0.1:9999");

    // Slice carries no workdir and no .path / .directory input keys.
    const slice = relay.slice as Record<string, unknown>;
    expect(slice.workdir).toBeUndefined();
    const inputs = slice.inputs_from_run as Record<string, unknown>;
    for (const key of Object.keys(inputs)) {
      expect(key.endsWith(".path")).toBe(false);
      expect(key.endsWith(".directory")).toBe(false);
    }
    // Reference-only keys survived.
    expect(inputs["steps.review.artifact.spec.transfer_id"]).toBe("ti_spec");
    expect(inputs["steps.review.artifact.chunks.transfer_ids"]).toEqual(["ti_a", "ti_b"]);

    // Ordered artifact references, one per producer step + slot, no paths.
    const refs = relay.artifact_references as Array<Record<string, unknown>>;
    expect(refs.length).toBe(2);
    const specRef = refs.find((r) => r.slot === "spec")!;
    const chunksRef = refs.find((r) => r.slot === "chunks")!;
    expect(specRef.producer_step).toBe("review");
    expect(specRef.cardinality).toBe("singleton");
    expect(chunksRef.cardinality).toBe("collection");
    const chunkFiles = chunksRef.files as Array<Record<string, unknown>>;
    expect(chunkFiles.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
    for (const ref of refs) {
      expect(ref).not.toHaveProperty("path");
      for (const file of ref.files as Array<Record<string, unknown>>) {
        expect(file).not.toHaveProperty("path");
        expect(file).not.toHaveProperty("local_path");
        expect(typeof file.transfer_id).toBe("string");
        expect(typeof file.digest).toBe("string");
      }
    }

    // Sanitized run artifacts bag carries no path.
    const runArtifacts = relay.run_artifacts as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(runArtifacts).toBeDefined();
    const serializedBag = JSON.stringify(runArtifacts);
    expect(serializedBag).not.toContain('"path"');
    expect(serializedBag).not.toContain("/tmp");
    expect(serializedBag).not.toContain(".mrmr/dev/runs");

    // No host path, run-scratch path, or local .path / .directory token crosses
    // the federation boundary in the full outbound body.
    expect(bodyStr).not.toContain("/tmp");
    expect(bodyStr).not.toContain(".mrmr/dev/runs");
    expect(bodyStr).not.toContain(".mrmr/dev/inbox");
    expect(bodyStr).not.toContain('"local_path"');
    expect(bodyStr).not.toContain('"workdir"');
    expect(bodyStr).not.toContain('"contract_path"');
    expect(bodyStr).not.toContain('"prompt_bindings"');
    expect(bodyStr).not.toContain('.path"');
    expect(bodyStr).not.toContain('.directory"');
  });

  test("omits step_contract when the producer context is absent", async () => {
    let captured: RemoteHubRelayInput | undefined;
    const executor = createRemoteHubExecutor({
      checkPeerHealth: async () => ({ status: "reachable" }),
      relayInvoke: async (input) => {
        captured = input;
        return {
          ok: true,
          http_status: 200,
          dispatch: { status: "dispatched", run_id: "run_42", step_id: "build" },
        };
      },
      sleep: async () => undefined,
    });

    const outcome = await executor.dispatch(
      {
        space_id: "spc_virtual",
        action_name: "build",
        run_id: "run_42",
        step_id: "build",
        params: { message: "plain" },
        delivery: "fail_fast",
      },
      {
        action: { name: "build" },
        binding: {
          type: "remote_hub",
          executor_id: "remote-exec",
          remote_hub_id: "hub_b",
          remote_space_id: "spc_remote",
        },
      },
    );
    expect(outcome.status).toBe("dispatched");
    expect(captured!.body.step_contract).toBeUndefined();
    expect(captured!.body.exec_input).toBeUndefined();
  });
});
