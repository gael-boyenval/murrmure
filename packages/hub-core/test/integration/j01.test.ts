import { describe, expect, test } from "vitest";
import { makeHub, mintActorToken } from "./helpers.js";
import { addGateId, addInstanceId, addSpaceId, addTokenId } from "../../src/index.js";
import { MURRMURE_DENIAL_CODES } from "@murrmure/contracts";

describe("j01/kernel-checkpoint-bridge-removed", () => {
  test("gate.resolve on a kernel-checkpoint gate id is rejected (no kernel bridge)", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: {
        space_id: bootstrapTok,
        actor_id: "actor_bootstrap",
        token_id: bootstrapTok,
      },
      slug: "review-alpha",
    });
    expect(space.outcome).toBe("success");
    const spaceId = space.body.space_id as string;
    const bareSpace = spaceId.replace("spc_", "");

    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JDEVTOKEN000000000001",
      actor_id: "actor_dev",
      space_id: bareSpace,
      capabilities: ["flow:run", "flow:read", "space:read"],
    });
    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JMAYATOKEN00000000001",
      actor_id: "actor_maya",
      space_id: bareSpace,
      capabilities: ["flow:run", "space:read"],
    });

    const devTok = addTokenId("01JDEVTOKEN000000000001");
    const mayaTok = addTokenId("01JMAYATOKEN00000000001");

    const instance = await hub.handler.execute({
      kind: "instance.create",
      provenance: {
        space_id: spaceId,
        actor_id: "actor_dev",
        token_id: devTok,
      },
      contract_ref_id: "cref_linear_demo",
      metadata: { title: "Feature X" },
    });
    expect(instance.outcome).toBe("success");
    const instanceId = instance.body.instance_id as string;

    // The kernel checkpoint creation path is retained: a transition whose rule
    // declares a checkpoint quorum still pauses the aggregate (checkpoint_pending).
    const transition = await hub.handler.execute({
      kind: "state.transition",
      provenance: {
        space_id: spaceId,
        instance_id: instanceId,
        actor_id: "actor_dev",
        token_id: devTok,
      },
      event: "submit",
      expected_revision: 0,
    });
    expect(transition.http_semantic).toBe(202);
    expect(transition.code).toBe("checkpoint_pending");
    const gateId = transition.body.gate_id as string;

    // But the hub no longer bridges gate.resolve → kernel checkpoint-resolve. The
    // gate id returned by a kernel checkpoint has no row in the gates table, so the
    // orchestration gate service denies resolution (gate_not_found, 404) instead of
    // advancing the kernel checkpoint.
    const resolve = await hub.handler.execute({
      kind: "gate.resolve",
      provenance: {
        space_id: spaceId,
        instance_id: instanceId,
        actor_id: "actor_maya",
        token_id: mayaTok,
      },
      gate_id: gateId,
      decision: "approved",
    });
    expect(resolve.outcome).toBe("denial");
    expect(resolve.code).toBe("gate_not_found");
    expect(resolve.http_semantic).toBe(404);

    // The gates-table resolution path does not clear kernel checkpoints: the
    // pending checkpoint remains in the gate_queue projection.
    const gates = await hub.handler.query("gate.list", { space_id: spaceId, instance_id: instanceId });
    expect((gates as unknown[]).length).toBe(1);
  });
});

describe("j01/reviewer-gate", () => {
  test("kernel checkpoint stays pending after a denied gate.resolve (bridge removed)", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "review-beta",
    });
    const spaceId = space.body.space_id as string;
    const bareSpace = spaceId.replace("spc_", "");

    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JDEVTOKEN000000000002",
      actor_id: "actor_dev",
      space_id: bareSpace,
      capabilities: ["flow:run", "flow:read"],
    });
    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JMAYATOKEN00000000002",
      actor_id: "actor_maya",
      space_id: bareSpace,
      capabilities: ["flow:run"],
    });

    const devTok = addTokenId("01JDEVTOKEN000000000002");
    const mayaTok = addTokenId("01JMAYATOKEN00000000002");

    const instance = await hub.handler.execute({
      kind: "instance.create",
      provenance: { space_id: spaceId, actor_id: "actor_dev", token_id: devTok },
      contract_ref_id: "cref_linear_demo",
    });
    const instanceId = instance.body.instance_id as string;

    await hub.handler.execute({
      kind: "state.transition",
      provenance: { space_id: spaceId, instance_id: instanceId, actor_id: "actor_dev", token_id: devTok },
      event: "submit",
      expected_revision: 0,
    });

    const pending = await hub.handler.query("gate.list", { space_id: spaceId, instance_id: instanceId });
    expect((pending as unknown[]).length).toBe(1);

    const gateId = (pending as Array<{ gate_id: string }>)[0]!.gate_id;
    const resolve = await hub.handler.execute({
      kind: "gate.resolve",
      provenance: { space_id: spaceId, instance_id: instanceId, actor_id: "actor_maya", token_id: mayaTok },
      gate_id: gateId,
      decision: "approved",
    });
    // The kernel checkpoint gate id is not a gates-table row → gate_not_found.
    expect(resolve.outcome).toBe("denial");
    expect(resolve.code).toBe("gate_not_found");
    expect(resolve.http_semantic).toBe(404);

    // Nothing cleared the kernel checkpoint — it is still pending.
    const cleared = await hub.handler.query("gate.list", { space_id: spaceId, instance_id: instanceId });
    expect((cleared as unknown[]).length).toBe(1);
  });
});

describe("j01/denial-wrong-space", () => {
  test("token scoped spc_A, call spc_B → scope_enforcement_failure", async () => {
    const hub = await makeHub();
    await hub.murrmurePersistence.insertToken(
      {
        token_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        actor_id: "actor_liam",
        space_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        capabilities: ["flow:run"],
        status: "active",
      },
      hub.clock.nowIso(),
    );

    const result = await hub.handler.execute({
      kind: "state.transition",
      provenance: {
        space_id: "spc_01BRZ3NDEKTSV4RRFFQ69G5FBW",
        instance_id: "ins_01CRZ3NDEKTSV4RRFFQ69G5FCX",
        actor_id: "actor_liam",
        token_id: "tok_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      },
      event: "submit",
      expected_revision: 0,
    });

    expect(result.code).toBe(MURRMURE_DENIAL_CODES.SCOPE_ENFORCEMENT_FAILURE);
    expect(result.http_semantic).toBe(403);
  });
});

describe("policy/harness-mismatch", () => {
  test("human_only install + agent token → denial", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "harness-test",
    });
    const spaceId = space.body.space_id as string;
    const bareSpace = spaceId.replace("spc_", "");

    await hub.murrmurePersistence.insertToken(
      {
        token_id: "01JSARAHTOKEN000000001",
        actor_id: "actor_sarah",
        space_id: bareSpace,
        capabilities: ["flow:run", "flow:read"],
        harness_id: "human_only",
        status: "active",
      },
      hub.clock.nowIso(),
    );

    const result = await hub.handler.execute({
      kind: "instance.create",
      provenance: {
        space_id: spaceId,
        actor_id: "actor_sarah",
        token_id: "tok_01JSARAHTOKEN000000001",
      },
      contract_ref_id: "cref_linear_demo",
    });

    expect(result.code).toBe(MURRMURE_DENIAL_CODES.HARNESS_MISMATCH);
  });
});

describe("j01/wait-bridge", () => {
  test("Studio gate wait condition maps to kernel checkpoint matcher", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const space = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "wait-bridge",
    });
    const spaceId = space.body.space_id as string;
    const bareSpace = spaceId.replace("spc_", "");

    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JDEVTOKEN000000000003",
      actor_id: "actor_dev",
      space_id: bareSpace,
      capabilities: ["flow:run", "flow:read", "space:read"],
    });
    const devTok = addTokenId("01JDEVTOKEN000000000003");

    const instance = await hub.handler.execute({
      kind: "instance.create",
      provenance: { space_id: spaceId, actor_id: "actor_dev", token_id: devTok },
      contract_ref_id: "cref_linear_demo",
    });
    const instanceId = instance.body.instance_id as string;

    await hub.handler.execute({
      kind: "state.transition",
      provenance: { space_id: spaceId, instance_id: instanceId, actor_id: "actor_dev", token_id: devTok },
      event: "submit",
      expected_revision: 0,
    });

    await hub.handler.execute({
      kind: "wait.register",
      provenance: { space_id: spaceId, instance_id: instanceId, actor_id: "actor_dev", token_id: devTok },
      condition: { type: "gate", resolution: "approved" },
      delivery_mode: "in_process",
    });

    const waitId = hub.handler.getLastWaitId()!;
    const before = await hub.handler.query("wait.poll", { space_id: spaceId, wait_id: waitId });
    expect((before as { status: string }).status).toBe("pending");
  });
});
