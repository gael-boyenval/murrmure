import { describe, expect, test, beforeAll, afterAll } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHubDaemon } from "../../../src/main.js";
import { addTokenId, buildRemoteStepContractRelay, exchangeFilePath } from "@murrmure/hub-core";
import { createRemoteHubExecutor } from "@murrmure/executors";
import type {
  DispatchContext,
  InvokeRequest,
  InvokeStepContractContext,
} from "@murrmure/runtime-contracts";

/** Recursively find any entry named `name` under `root`; returns its path or undefined. */
function findEntry(root: string, name: string): string | undefined {
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (entry === name) return full;
    try {
      if (statSync(full).isDirectory()) {
        const found = findEntry(full, name);
        if (found) return found;
      }
    } catch {
      /* ignore broken entries */
    }
  }
  return undefined;
}

/**
 * Real two-hub collection relay proving cross-hub artifact byte transfer.
 *
 * The producer hub (hubA) registers the collection bytes in its own artifact
 * store and authorizes the consumer space. The consumer hub (hubB) never has
 * the bytes pre-seeded: its destination `InvokeService` reconstructs the
 * relayed reference-only step contract, fetches each referenced artifact from
 * hubA's `GET /v1/artifacts/:transfer_id/bytes` endpoint (validating ACL /
 * expiry / digest on the producer), materializes verified consumer copies in
 * its own run-scratch tree, rebinds them into the handler tokens, and a real
 * `shell_spawn` handler binds `.directory` to its materialized consumer copy.
 *
 * A second test proves the relay path enforces artifact ACL parity with the
 * normal `artifacts_in` path: a relayed reference whose producer artifact is
 * not authorized for the consumer space is rejected with
 * `ARTIFACT_ACCESS_DENIED` before any bytes are materialized.
 */
describe("federation/collection-relay — two-hub cross-hub artifact retrieval", () => {
  let hubA: { baseUrl: string; cleanup: () => void; token: string; spaceId: string; boundToken: string };
  let hubB: {
    baseUrl: string;
    cleanup: () => void;
    token: string;
    spaceId: string;
    root: string;
    dataDir: string;
  };
  let daemonA: Awaited<ReturnType<typeof startHubDaemon>>;
  let daemonB: Awaited<ReturnType<typeof startHubDaemon>>;

  const bare = (id: string) => (id.startsWith("spc_") ? id.slice(4) : id);

  /**
   * Mint a federated resolve token on the producer hub (hubA) bound to the
   * consumer space, mirroring what `invokeAction` mints for a `remote_hub`
   * dispatch. The producer `GET .../bytes` endpoint binds the artifact ACL
   * principal to this credential (not a caller-supplied `?space_id=`), so the
   * legitimate cross-hub fetch proves ACL identity binding — parity with the
   * normal `artifacts_in` path.
   */
  async function mintBoundResolveToken(consumerSpaceId: string): Promise<string> {
    const tokenId = `reltok_${Math.random().toString(36).slice(2)}`;
    await daemonA.ctx.murrmurePersistence.insertToken(
      {
        token_id: tokenId,
        actor_id: "actor_relay",
        space_id: bare(hubA.spaceId),
        scopes: ["step:resolve"],
        capabilities: ["step:resolve"],
        harness_id: "run:run_prod",
        scope_ref: "run_prod:build:relay_collection",
        status: "active",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        consumer_space_id: bare(consumerSpaceId),
      },
      new Date().toISOString(),
    );
    return `tok_${tokenId}`;
  }

  const collection = [
    { name: "01-openapi.json", content: '{"openapi":"3.0"}\n' },
    { name: "02-paths.json", content: '{"paths":{}}\n' },
  ];
  interface UploadedArtifact {
    id: string;
    name: string;
    digest: string;
    size_bytes: number;
    content: string;
  }
  let collectionArtifacts: UploadedArtifact[] = [];

  beforeAll(async () => {
    const dirA = mkdtempSync(join(tmpdir(), "fed-coll-hub-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "fed-coll-hub-b-"));
    const tokenA = "01JBOOTSTRAPTOKEN0000000A";
    const tokenB = "01JBOOTSTRAPTOKEN0000000B";

    daemonA = await startHubDaemon({
      databasePath: join(dirA, "murrmure.db"),
      port: 0,
      dataDir: join(dirA, "data"),
      defaultSpaceId: "",
      bootstrapToken: tokenA,
    });
    daemonB = await startHubDaemon({
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
      spaceId: "",
      boundToken: "",
      cleanup: () => {
        daemonA.server.close();
        rmSync(dirA, { recursive: true, force: true });
      },
    };
    hubB = {
      baseUrl: `http://127.0.0.1:${portB}`,
      token: tokenB,
      root: dirB,
      dataDir: join(dirB, "data"),
      spaceId: "",
      cleanup: () => {
        daemonB.server.close();
        rmSync(dirB, { recursive: true, force: true });
      },
    };

    const authA = () => ({
      Authorization: `Bearer ${addTokenId(tokenA)}`,
      "Content-Type": "application/json",
    });
    const authB = () => ({
      Authorization: `Bearer ${addTokenId(tokenB)}`,
      "Content-Type": "application/json",
    });

    // hubB (consumer): a real space with a linked root and a collection-
    // consuming shell handler that binds `.directory` and writes the sorted
    // filenames to a marker file in the space root (its cwd).
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

    // hubA (producer): a real space that owns the collection bytes. The
    // producer relay references these transfer ids; the destination fetches
    // them from hubA. No link is required to register artifacts.
    const createdA = await fetch(`${hubA.baseUrl}/v1/spaces`, {
      method: "POST",
      headers: authA(),
      body: JSON.stringify({ slug: "collection-producer", name: "Collection Producer" }),
    });
    hubA.spaceId = ((await createdA.json()) as { space_id: string }).space_id;

    // Mint a federated resolve token on the producer bound to the consumer
    // space, mirroring `invokeAction`'s `remote_hub` mint. The producer bytes
    // endpoint binds the artifact ACL principal to this credential.
    hubA.boundToken = await mintBoundResolveToken(hubB.spaceId);

    // Register the collection on hubA, authorizing the consumer space (hubB).
    // These bytes exist ONLY on hubA — hubB's artifact store is never seeded.
    collectionArtifacts = [];
    for (const file of collection) {
      const put = await fetch(`${hubA.baseUrl}/v1/artifacts`, {
        method: "PUT",
        headers: authA(),
        body: JSON.stringify({
          space_id: hubA.spaceId,
          name: file.name,
          content_base64: Buffer.from(file.content, "utf8").toString("base64"),
          authorized_readers: [hubB.spaceId],
        }),
      });
      expect(put.status).toBe(201);
      const artifact = ((await put.json()) as { artifact: { transfer_id: string; digest: string; size_bytes: number } }).artifact;
      collectionArtifacts.push({
        id: artifact.transfer_id,
        name: file.name,
        digest: artifact.digest,
        size_bytes: artifact.size_bytes,
        content: file.content,
      });
    }
  }, 60_000);

  afterAll(() => {
    hubA?.cleanup?.();
    hubB?.cleanup?.();
  });

  /** Producer step contract carrying the collection run-artifacts bag (the
   *  producer `path` values are stripped by the relay sanitizer; only
   *  `transfer_id` / `digest` / `name` / `size_bytes` cross the boundary). */
  function producerStepContract(files: UploadedArtifact[]): InvokeStepContractContext {
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
          files: files.map((f) => ({
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
      hub_token: hubA.boundToken,
      hub_url: hubA.baseUrl,
    };
  }

  test("destination fetches relayed collection bytes from the producer hub and binds .directory", async () => {
    const markerPath = join(hubB.root, "consume-result.txt");

    // Prove the destination store is NOT pre-seeded: the collection bytes live
    // only on hubA. The destination must fetch them across the federation
    // boundary to materialize consumer copies.
    for (const artifact of collectionArtifacts) {
      const destExchange = exchangeFilePath(hubB.dataDir, artifact.id, artifact.name);
      expect(existsSync(destExchange), "destination artifact store must not be pre-seeded").toBe(false);
    }

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
      step_contract: producerStepContract(collectionArtifacts),
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

    // The materialized consumer copies live under the destination's own
    // run-scratch tree (never a producer path), and the destination store was
    // never seeded — bytes were fetched from hubA and written as consumer
    // copies only. The marker lists filenames, never producer run ids or
    // producer asset paths.
    const runsDir = join(hubB.root, ".mrmr", "dev", "runs");
    expect(existsSync(runsDir)).toBe(true);
    expect(marker!).not.toContain("run_prod");
    expect(marker!).not.toContain("steps/intake/assets");
    for (const artifact of collectionArtifacts) {
      const destExchange = exchangeFilePath(hubB.dataDir, artifact.id, artifact.name);
      expect(existsSync(destExchange), "destination store must remain unseeded after relay").toBe(false);
    }
  }, 30_000);

  test("destination rejects a relayed reference whose producer artifact is not ACL-authorized", async () => {
    // Register an artifact on hubA authorized to hubA's space only — NOT to the
    // consumer space (hubB). The relay references it; the destination fetch
    // must be denied by the producer's ACL check.
    const secret = "producer-only-bytes";
    const put = await fetch(`${hubA.baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${addTokenId(hubA.token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: hubA.spaceId,
        name: "producer-only.json",
        content_base64: Buffer.from(secret, "utf8").toString("base64"),
        authorized_readers: [hubA.spaceId],
      }),
    });
    expect(put.status).toBe(201);
    const unauthorized = ((await put.json()) as { artifact: { transfer_id: string; digest: string; size_bytes: number } }).artifact;

    // Build a relayed step contract that references the unauthorized artifact,
    // then POST it straight to the destination invoke.
    const relay = buildRemoteStepContractRelay(
      producerStepContract([
        {
          id: unauthorized.transfer_id,
          name: "producer-only.json",
          digest: unauthorized.digest,
          size_bytes: unauthorized.size_bytes,
          content: secret,
        },
      ]),
    );
    expect(relay).toBeDefined();

    const res = await fetch(
      `${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/actions/consume_collection/invoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${addTokenId(hubB.token)}`,
        },
        body: JSON.stringify({ step_id: "build", step_contract: relay }),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");

    // No consumer copy was materialized for the rejected reference.
    expect(
      findEntry(join(hubB.root, ".mrmr", "dev", "runs"), "producer-only.json"),
      "no consumer copy materialized for the denied reference",
    ).toBeUndefined();
  }, 30_000);

  test("destination rejects a relayed credential bound to the wrong consumer space", async () => {
    // Mint a producer resolve token bound to hubA's OWN space (wrong consumer)
    // but reference an artifact ACL-authorized to hubB. The producer bytes
    // endpoint must reject at the binding gate (consumer_space_id=hubA ≠
    // claimed hubB) before any bytes are served — proving the ACL principal is
    // bound to the credential, not a caller-supplied `?space_id=`. A uniquely-
    // named artifact isolates this assertion from the positive test's copies.
    const target = "wrong-space-target.json";
    const content = "wrong-space-target-bytes";
    const put = await fetch(`${hubA.baseUrl}/v1/artifacts`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${addTokenId(hubA.token)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space_id: hubA.spaceId,
        name: target,
        content_base64: Buffer.from(content, "utf8").toString("base64"),
        authorized_readers: [hubB.spaceId],
      }),
    });
    expect(put.status).toBe(201);
    const artifact = ((await put.json()) as { artifact: { transfer_id: string; digest: string; size_bytes: number } }).artifact;

    const wrongToken = await mintBoundResolveToken(hubA.spaceId);
    const relay = buildRemoteStepContractRelay(
      producerStepContract([
        {
          id: artifact.transfer_id,
          name: target,
          digest: artifact.digest,
          size_bytes: artifact.size_bytes,
          content,
        },
      ]),
    );
    expect(relay).toBeDefined();
    // Override the relayed hub_token with the wrong-consumer-bound credential.
    (relay as { hub_token?: string }).hub_token = wrongToken;

    const res = await fetch(
      `${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/actions/consume_collection/invoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${addTokenId(hubB.token)}`,
        },
        body: JSON.stringify({ step_id: "build", step_contract: relay }),
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("ARTIFACT_ACCESS_DENIED");

    // No consumer copy was materialized for the wrong-space credential.
    expect(
      findEntry(join(hubB.root, ".mrmr", "dev", "runs"), target),
      "no consumer copy materialized for the wrong-space credential",
    ).toBeUndefined();
  }, 30_000);

  test("destination rejects a relayed invoke whose step_id would escape the linked space root", async () => {
    // A crafted relayed public `step_id` is used as the destination
    // `consumer_step` path segment. Without segment validation it would
    // normalize past the run scratch tree: `join(space_root,
    // .mrmr/dev/runs/{run_id}/steps/../../../../../../murrmure_relay_escape/
    // inputs/assets/01-openapi.json)` cancels every run-scratch segment and
    // lands at `dirname(space_root)/murrmure_relay_escape/inputs/assets/...`,
    // writing verified producer bytes outside the linked space root. The
    // destination must reject the relay with a typed ARTIFACT_PATH_TRAVERSAL
    // before any consumer copy is materialized or any producer fetch occurs.
    const relay = buildRemoteStepContractRelay(producerStepContract(collectionArtifacts));
    expect(relay).toBeDefined();

    const escapeStep = "../../../../../../murrmure_relay_escape";
    const res = await fetch(
      `${hubB.baseUrl}/v1/spaces/${hubB.spaceId}/actions/consume_collection/invoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${addTokenId(hubB.token)}`,
        },
        body: JSON.stringify({ step_id: escapeStep, step_contract: relay }),
      },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("ARTIFACT_PATH_TRAVERSAL");

    // No consumer copy was materialized under the destination runs tree.
    expect(
      findEntry(join(hubB.root, ".mrmr", "dev", "runs"), "murrmure_relay_escape"),
      "no escape directory materialized under the destination runs tree",
    ).toBeUndefined();
    // Nothing escaped the space root: the traversal-normalized escape base
    // (one level above the space root, independent of the generated run id)
    // was never created, and no collection filename landed out of root.
    expect(existsSync(join(hubB.root, "..", "murrmure_relay_escape"))).toBe(false);
    expect(existsSync(join(hubB.root, "murrmure_relay_escape"))).toBe(false);
    for (const file of collection) {
      expect(
        findEntry(join(hubB.root, "..", "murrmure_relay_escape"), file.name),
        `no out-of-root write of ${file.name}`,
      ).toBeUndefined();
    }
  }, 30_000);
});
