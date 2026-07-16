import type { Capability } from "@murrmure/contracts";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { createHubKernel, HubHandler } from "../../src/index.js";
import { pinHubContractFixture } from "../../../../test-utils/hub/contracts.js";

let fixedSeq = 0;
const FIXED_TS = "2026-06-20T12:00:00.000Z";

export function fixedIdPort(): IdPort {
  return {
    ulid: () => {
      fixedSeq += 1;
      return `01JFIXED${String(fixedSeq).padStart(16, "0")}`;
    },
  };
}

export function fixedClockPort(): ClockPort {
  return { nowIso: () => FIXED_TS };
}

export function resetFixedIds() {
  fixedSeq = 0;
}

export async function makeHub() {
  resetFixedIds();
  const kernelPersistence = new InMemoryPersistence();
  const murrmurePersistence = new MemoryStudioPersistence();
  const ids = fixedIdPort();
  const clock = fixedClockPort();

  const bootstrapToken = "01JBOOTSTRAPTOKEN00000001";
  const bootstrapCapabilities: Capability[] = [
    "hub:admin",
    "space:read",
    "space:write",
    "space:enter",
    "flow:read",
    "flow:run",
    "event:emit",
    "step:resolve",
    "journal:read",
  ];
  await murrmurePersistence.insertToken(
    {
      token_id: bootstrapToken,
      actor_id: "actor_bootstrap",
      space_id: "bootstrap",
      scopes: bootstrapCapabilities,
      capabilities: bootstrapCapabilities,
      status: "active",
    },
    FIXED_TS,
  );

  const contract = await pinHubContractFixture(
    murrmurePersistence,
    "linear-demo-v2",
    "cref_linear_demo",
  );

  const { kernel } = createHubKernel({
    kernelPersistence,
    murrmurePersistence,
    ids,
    clock,
  });

  const handler = new HubHandler(kernel, murrmurePersistence, ids, clock);

  return {
    handler,
    kernel,
    kernelPersistence,
    murrmurePersistence,
    bootstrapToken,
    contract,
    ids,
    clock,
    tok: (bare: string) => `tok_${bare}`,
    spc: (bare: string) => `spc_${bare}`,
    ins: (bare: string) => `ins_${bare}`,
    chk: (bare: string) => `chk_${bare}`,
  };
}

export async function mintActorToken(
  studio: MemoryStudioPersistence,
  params: {
    token_id: string;
    actor_id: string;
    space_id: string;
    scopes?: string[];
    capabilities?: Capability[];
    harness_id?: string;
  },
) {
  const capabilities: Capability[] =
    params.capabilities ??
    (params.scopes as Capability[] | undefined) ??
    (["flow:run", "space:read"] as Capability[]);
  await studio.insertToken(
    {
      token_id: params.token_id,
      actor_id: params.actor_id,
      space_id: params.space_id,
      scopes: params.scopes ?? capabilities,
      capabilities,
      harness_id: params.harness_id,
      status: "active",
    },
    FIXED_TS,
  );
}
