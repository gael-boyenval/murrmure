import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContractV2Schema, type ContractV2 } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { pinContract } from "../../packages/hub-core/src/kernel.js";

export type HubContractFixture = "linear-demo-v2";

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "contracts");

export function loadHubContractFixture(name: HubContractFixture): ContractV2 {
  const raw = JSON.parse(readFileSync(join(FIXTURE_ROOT, `${name}.json`), "utf-8"));
  return ContractV2Schema.parse(raw);
}

export async function pinHubContractFixture(
  studio: StudioPersistencePort,
  name: HubContractFixture,
  contractRefId: string,
): Promise<ContractV2> {
  const contract = loadHubContractFixture(name);
  await pinContract(studio, contractRefId, contract);
  return contract;
}
