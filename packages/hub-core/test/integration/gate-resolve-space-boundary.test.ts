import { describe, expect, test } from "vitest";
import { makeHub, mintActorToken } from "./helpers.js";
import { addGateId, addTokenId } from "../../src/index.js";
import type { GateRow } from "@murrmure/hub-persistence";

/**
 * Handler-level guard for the gate.resolve space boundary.
 *
 * `HubHandler.handleGateResolve` must forward `cmd.provenance.space_id` into
 * `resolveGate` so the gate service can reject a token that resolves a gate
 * belonging to another space. `enforceSpacePath` only checks that the token is
 * scoped to the provenance path space — it does not check that the gate lives
 * in that space, so without passing `space_id` a space-A token could resolve a
 * space-B gate by supplying its gate_id.
 */
describe("hub handler gate.resolve space boundary", () => {
  test("space-A token cannot resolve a space-B gate (SCOPE_ENFORCEMENT_FAILURE)", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const spaceA = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "boundary-a",
    });
    const spaceB = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "boundary-b",
    });
    const spaceAId = spaceA.body.space_id as string;
    const spaceBId = spaceB.body.space_id as string;
    const bareA = spaceAId.replace("spc_", "");
    const bareB = spaceBId.replace("spc_", "");

    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JBOUNDARYTOKEN0000001",
      actor_id: "actor_runner",
      space_id: bareA,
      capabilities: ["flow:run", "space:read"],
    });
    const runnerTok = addTokenId("01JBOUNDARYTOKEN0000001");

    // A pending gate that lives in space B.
    const gateBare = "01JBOUNDARYGATE0000001";
    const gateRow: GateRow = {
      gate_id: gateBare,
      run_id: "01JBOUNDARYRUN000001",
      session_id: "01JBOUNDARYSES000001",
      space_id: bareB,
      step_id: "gate:review",
      status: "pending",
      resolve_mode: "any_one",
      assignees: ["actor_runner"],
      created_at: hub.clock.nowIso(),
    };
    await hub.murrmurePersistence.insertGate(gateRow);

    // Provenance path is space A (passes enforceSpacePath); the gate belongs to
    // space B. resolveGate must reject via the space boundary.
    const resolve = await hub.handler.execute({
      kind: "gate.resolve",
      provenance: { space_id: spaceAId, actor_id: "actor_runner", token_id: runnerTok },
      gate_id: addGateId(gateBare),
      decision: "approved",
    });

    expect(resolve.outcome).toBe("denial");
    expect(resolve.code).toBe("SCOPE_ENFORCEMENT_FAILURE");
    expect(resolve.http_semantic).toBe(403);

    const after = await hub.murrmurePersistence.getGate(gateBare);
    expect(after?.status).toBe("pending");
  });

  test("space-A token resolves a space-A gate (success)", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const spaceA = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "boundary-a-ok",
    });
    const spaceAId = spaceA.body.space_id as string;
    const bareA = spaceAId.replace("spc_", "");

    await mintActorToken(hub.murrmurePersistence, {
      token_id: "01JBOUNDARYTOKEN0000002",
      actor_id: "actor_runner",
      space_id: bareA,
      capabilities: ["flow:run", "space:read"],
    });
    const runnerTok = addTokenId("01JBOUNDARYTOKEN0000002");

    const gateBare = "01JBOUNDARYGATE0000002";
    await hub.murrmurePersistence.insertGate({
      gate_id: gateBare,
      run_id: "01JBOUNDARYRUN000002",
      session_id: "01JBOUNDARYSES000002",
      space_id: bareA,
      step_id: "gate:review",
      status: "pending",
      resolve_mode: "any_one",
      assignees: ["actor_runner"],
      created_at: hub.clock.nowIso(),
    });

    const resolve = await hub.handler.execute({
      kind: "gate.resolve",
      provenance: { space_id: spaceAId, actor_id: "actor_runner", token_id: runnerTok },
      gate_id: addGateId(gateBare),
      decision: "approved",
    });

    expect(resolve.outcome).toBe("success");
    expect(resolve.code).toBe("gate_resolved");

    const after = await hub.murrmurePersistence.getGate(gateBare);
    expect(after?.status).toBe("approved");
  });

  test("bootstrap (privileged) resolves a space-B gate cross-space (success)", async () => {
    const hub = await makeHub();
    const bootstrapTok = addTokenId(hub.bootstrapToken);

    const spaceB = await hub.handler.execute({
      kind: "space.create",
      provenance: { space_id: bootstrapTok, actor_id: "actor_bootstrap", token_id: bootstrapTok },
      slug: "boundary-b-priv",
    });
    const spaceBId = spaceB.body.space_id as string;
    const bareB = spaceBId.replace("spc_", "");

    const gateBare = "01JBOUNDARYGATE0000003";
    await hub.murrmurePersistence.insertGate({
      gate_id: gateBare,
      run_id: "01JBOUNDARYRUN000003",
      session_id: "01JBOUNDARYSES000003",
      space_id: bareB,
      step_id: "gate:review",
      status: "pending",
      resolve_mode: "any_one",
      created_at: hub.clock.nowIso(),
    });

    const resolve = await hub.handler.execute({
      kind: "gate.resolve",
      provenance: { space_id: "bootstrap", actor_id: "actor_bootstrap", token_id: bootstrapTok },
      gate_id: addGateId(gateBare),
      decision: "approved",
    });

    expect(resolve.outcome).toBe("success");
    expect(resolve.code).toBe("gate_resolved");

    const after = await hub.murrmurePersistence.getGate(gateBare);
    expect(after?.status).toBe("approved");
  });
});
