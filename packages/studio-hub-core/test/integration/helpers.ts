import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IdPort, ClockPort } from "@murrmure/runtime-contracts";
import { ContractV2Schema } from "@murrmure/contracts";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
import { MemoryStudioPersistence } from "@murrmure/hub-persistence";
import { createHubKernel, pinContract, HubHandler } from "../../src/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../../fixtures/hub");

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
  await murrmurePersistence.insertToken(
    {
      token_id: bootstrapToken,
      actor_id: "actor_bootstrap",
      space_id: "bootstrap",
      scopes: [
        "space:admin",
        "space:read",
        "state:transition",
        "event:emit",
        "flow:install",
        "trigger:register",
        "blob:write",
        "federation:emit",
      ],
      status: "active",
    },
    FIXED_TS,
  );

  const contractRaw = JSON.parse(
    readFileSync(join(FIXTURES, "contracts/linear-demo-v2.json"), "utf-8"),
  );
  const contract = ContractV2Schema.parse(contractRaw);
  await pinContract(murrmurePersistence, "cref_linear_demo", contract);

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
    harness_id?: string;
  },
) {
  await studio.insertToken(
    {
      token_id: params.token_id,
      actor_id: params.actor_id,
      space_id: params.space_id,
      scopes: params.scopes ?? ["state:transition", "space:read"],
      harness_id: params.harness_id,
      status: "active",
    },
    FIXED_TS,
  );
}
