import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ulid } from "ulid";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId } from "@murrmure/hub-core";
import { createRemoteHubExecutor } from "@murrmure/executors";
import type {
  DispatchContext,
  InvokeRequest,
  InvokeStepContractContext,
} from "@murrmure/runtime-contracts";

/**
 * Real two-hub collection relay: a producer hub relays an ordered collection to
 * a peer hub, which runs the destination `InvokeService` (relay handling +
 * materialization + rebind) and a consuming `shell_spawn` handler that binds
 * `.directory` to its own materialized consumer copy.
 *
 * Unlike `remote-hub-relay.test.ts` (which captures the outbound executor body
 * only), this test crosses the HTTP/destination boundary: the real
 * `createRemoteHubExecutor` serializes a sanitized reference-only step contract,
 * a real `fetch` POSTs it to hubB's live `/v1/spaces/:space/actions/:action/
 * invoke`, and hubB's `InvokeService` reconstructs the contract, materializes
 * the ordered references from local bytes, rebinds the verified consumer copies
 * into the handler tokens, and dispatches a real collection-consuming handler.
 */
describe("federation/collection-relay — two-hub destination materialization", () => {
  let hubA: { baseUrl: string; cleanup: () => void; token: string };
  let hubB: {
    baseUrl: string;
    cleanup: () => void;
    token: string;
    spaceId: string;
    root: string;
  };

  const collection = [
    { name: "01-openapi.json", content: '{"openapi":"3.0"}\n' },
    { name: "02-paths.json", content: '{"paths":{}}\n' },
  ];
  let transferIds: { id: string; name: string; digest: string; size_bytes: number }[];

  beforeAll(async () => {
    const dirA = mkdtempSync(join(tmpdir(), "fed-coll-hub-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "fed-coll-hub-b-"));
    const tokenA = "01JBOOTSTRAPTOKEN0000000A";
    const tokenB = "01JBOOTSTRAPTOKEN0000000B";

    const daemonA = await startHubDaemon({
      databasePath: join(dirA, "murrmure.db"),
      port: 0,
      dataDir: join(dirA, "data"),
      defaultSpaceId: "",
      bootstrapToken: tokenA,
    });
    const daemonB = await startHubDaemon({
      databasePath: join(dirB, "murrmure.db"),
      port: 0,
      dataDir: join(dirB, "data"),
      defaultSpaceId: "",
      bootstrapToken: tokenB,
    });

    const portA = (daemonA.server.address() as { port: number }).port;
    const portB = (daemonB.server.address() as { port: number }).port;

    hubA = {
      baseUrl: `http://127.0.0.1:${portA}`,
      token: tokenA,
      cleanup: () => {
        daemonA.server.close();
        rmSync(dirA, { recursive: true, force: true });
      },
    };
    hubB = {
      baseUrl: `http://127.0.0.1:${portB}`,
      token: tokenB,
      root: dirB,
      spaceId: "",
      cleanup: () => {
        daemonB.server.close();
        rmSync(dirB, { recursive: true, force: true });
      },
    };

    const authB = () => ({
      Authorization: `Bearer ${addTokenId(tokenB)}`,
      "Content-Type": "application/json",
    });

    // hubB (consumer): a real space with a linked root, a collection-consuming
    // shell handler, and the producer's collection bytes pre-seeded in its
    // artifact store under the relayed transfer ids (mirroring bytes replicated
    // to the destination before the relay).
    const createdB = await fetch(`${hubB.baseUrl}/v1/spaces`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({ slug: "collection-consumer", name: "Collection Consumer" }),
    });
    hubB.spaceId = ((await createdB.json()) as { space_id: string }).space_id;

    await fetch(`${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/link`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({ host: "test", path: dirB, primary: true }),
    });

    // The consuming handler lists the materialized collection directory and
    // writes the sorted filenames to a marker file in the space root (its cwd).
    mkdirSync(join(dirB, "bin"), { recursive: true });
    writeFileSync(
      join(dirB, "bin", "consume.sh"),
      '#!/bin/sh\nls "$1" | sort > ./consume-result.txt\n',
    );
    chmodSync(join(dirB, "bin", "consume.sh"), 0o755);

    await fetch(`${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/apply`, {
      method: "POST",
      headers: authB(),
      body: JSON.stringify({
        bundle: {
          actions: {
            digest: "sha256:consume-actions",
            file: {
              version: 1,
              actions: {
                consume_collection: {
                  executor: "shell",
                  command: "./bin/consume.sh {{murrmure.step.intake.artifact.assets.directory}}",
                  delivery: "fail_fast",
                },
              },
            },
          },
          executors: {
            digest: "sha256:consume-exec",
            file: {
              executors: {
                shell: { binding: { type: "shell_spawn", executor_id: "shell" } },
              },
            },
          },
          flows: [],
          views: [],
        },
      }),
    });

    // Pre-seed hubB's artifact store with the collection bytes under explicit
    // transfer ids (idempotent re-registration). The producer relay references
    // these same ids; the destination materializes from its local copies.
    transferIds = [];
    for (const file of collection) {
      const transfer_id = `xfr_${ulid()}`;
      const put = await fetch(`${hubB.baseUrl}/v1/artifacts`, {
        method: "PUT",
        headers: authB(),
        body: JSON.stringify({
          space_id: hubB.spaceId,
          name: file.name,
          content_base64: Buffer.from(file.content, "utf8").toString("base64"),
          authorized_readers: [hubB.spaceId],
          transfer_id,
        }),
      });
      expect(put.status).toBe(201);
      const artifact = ((await put.json()) as { artifact: { transfer_id: string; digest: string; size_bytes: number } }).artifact;
      transferIds.push({
        id: artifact.transfer_id,
        name: file.name,
        digest: artifact.digest,
        size_bytes: artifact.size_bytes,
      });
    }

    // hubA (producer): a real space mirroring the peer, so the relayed
    // `hub_token` / `hub_url` point at a live producer hub that holds the
    // originals. The producer step contract is built below to reference the
    // relayed collection.
    await fetch(`${hubA.baseUrl}/v1/spaces`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${addTokenId(tokenA)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug: "collection-producer", name: "Collection Producer" }),
    });
  }, 60_000);

  afterAll(() => {
    hubA?.cleanup?.();
    hubB?.cleanup?.();
  });

  /** Producer step contract carrying the collection run-artifacts bag (the
   *  producer `path` values are stripped by the relay sanitizer). */
  function producerStepContract(): InvokeStepContractContext {
    const slice = {
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
    };
    const runArtifacts = {
      intake: {
        assets: {
          slot: "assets",
          cardinality: "collection",
          files: transferIds.map((f) => ({
            name: f.name,
            path: `.mrmr/dev/runs/run_prod/steps/intake/assets/${f.name}`,
            transfer_id: f.id,
            digest: f.digest,
            size_bytes: f.size_bytes,
          })),
        },
      },
    };
    return {
      slice_json: JSON.stringify(slice),
      contract_path: `${hubA.baseUrl}/producer/active-step-contract.json`,
      workdir: ".mrmr/dev/runs/run_prod/steps/build/work",
      prompt_bindings: {
        run_id: "run_prod",
        space_root: "/producer",
        agentStepContract: "### Active step: build",
        "inputs.json": "{}",
      },
      run_artifacts_json: JSON.stringify(runArtifacts),
      contract_key_count: 2,
      hub_token: addTokenId(hubA.token),
      hub_url: hubA.baseUrl,
    };
  }

  test("destination InvokeService materializes the relayed collection and the handler binds .directory", async () => {
    const markerPath = join(hubB.root, "consume-result.txt");

    // Real remote_hub executor; relayInvoke performs a real HTTP POST to hubB.
    const executor = createRemoteHubExecutor({
      checkPeerHealth: async () => ({ status: "reachable" }),
      relayInvoke: async (input) => {
        const spaceId = input.remote_space_id.startsWith("spc_")
          ? input.remote_space_id
          : `spc_${input.remote_space_id}`;
        const res = await fetch(
          `${hubB.baseUrl}/v1/spaces/${spaceId}/actions/${encodeURIComponent(input.action_name)}/invoke`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${addTokenId(hubB.token)}`,
            },
            body: JSON.stringify(input.body),
          },
        );
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return {
          ok: res.ok,
          http_status: res.status,
          dispatch: body.dispatch as { status: string; run_id?: string; step_id?: string },
          body,
        };
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    const invoke: InvokeRequest = {
      space_id: "spc_producer",
      action_name: "relay_collection",
      step_id: "build",
      params: { message: "relay-collection" },
      exec_input: { owner: "alice" },
      expect: { response_schema: "murrmure:result/v1:ok" },
      // Producer transfer ids ride along in artifacts_in; finding-1 keeps the
      // destination store resolution from rejecting them before relay handling.
      artifacts_in: transferIds.map((f) => f.id),
      delivery: "fail_fast",
    };
    const context: DispatchContext = {
      action: { name: "consume_collection" },
      binding: {
        type: "remote_hub",
        executor_id: "remote-exec",
        remote_hub_id: "hub_b",
        remote_space_id: hubB.spaceId,
      },
      space_root: "/producer",
      exec_input: { owner: "alice" },
      step_contract: producerStepContract(),
    };

    const outcome = await executor.dispatch(invoke, context);
    expect(["dispatched", "completed"]).toContain(outcome.status);

    // The destination handler runs detached; poll for the marker it writes from
    // the materialized collection directory.
    const deadline = Date.now() + 10_000;
    let marker: string | undefined;
    while (Date.now() < deadline) {
      if (existsSync(markerPath)) {
        marker = readFileSync(markerPath, "utf8");
        if (marker.trim().length > 0) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(marker, "handler marker file was written").toBeDefined();
    const listed = marker!.trim().split(/\n+/).filter(Boolean);
    expect(listed).toEqual(collection.map((f) => f.name));

    // The materialized consumer directory lives under the destination's own
    // run-scratch tree (never a producer path), and contains both files.
    const runsDir = join(hubB.root, ".mrmr", "dev", "runs");
    expect(existsSync(runsDir)).toBe(true);
    const markerBlob = marker!;
    expect(markerBlob).not.toContain("run_prod");
    expect(markerBlob).not.toContain("steps/intake/assets");
  }, 30_000);
});
