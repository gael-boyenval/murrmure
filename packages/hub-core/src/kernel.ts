import type {
  ReactionActionPort,
  ClockPort,
  CommandResult,
  IdPort,
  InProcessWaitRegistry,
  NotifyPort,
  PersistencePort,
  SchemaPort,
  ConvergencePort,
} from "@murrmure/runtime-contracts";
import { ruleRefDigest } from "@murrmure/runtime-contracts";
import { RuntimeKernel, DeferredWaitRegistry } from "@murrmure/runtime-kernel";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import type { ContractV2 } from "@murrmure/contracts";
import { createStudioPolicyPort } from "./ports/policy.js";
import { createStudioRulesPort } from "./ports/rules.js";
import { createCelConditionPort } from "./ports/condition.js";
import { gateQueueHandler, grantInventoryHandler } from "./projections/gate-queue.js";
import Ajv from "ajv";

export interface HubKernelDeps {
  kernelPersistence: PersistencePort;
  murrmurePersistence: StudioPersistencePort;
  clock: ClockPort;
  ids: IdPort;
  action?: ReactionActionPort;
  notify?: NotifyPort;
  schema?: SchemaPort;
  convergence?: ConvergencePort;
  waitRegistry?: InProcessWaitRegistry;
}

export function createHubKernel(deps: HubKernelDeps) {
  const waitRegistry = deps.waitRegistry ?? new DeferredWaitRegistry();
  const projectionHandlers = new Map([
    ["gate_queue", gateQueueHandler],
    ["grant_inventory", grantInventoryHandler],
  ]);

  const kernel = new RuntimeKernel({
    persistence: deps.kernelPersistence,
    policy: createStudioPolicyPort(deps.murrmurePersistence),
    rules: createStudioRulesPort(deps.murrmurePersistence),
    condition: createCelConditionPort(),
    schema: deps.schema ?? createAjvSchema(),
    convergence: deps.convergence ?? { evaluate: async () => ({ emit: [] }) },
    notify: deps.notify ?? {
      resolveWait: async (wait_id, resolution) => waitRegistry.resolve(wait_id, resolution),
    },
    action: deps.action ?? { invoke: async () => ({ outcome: "success" }) },
    clock: deps.clock,
    ids: deps.ids,
    waitRegistry,
    projectionHandlers,
  });

  return { kernel, waitRegistry };
}

function createAjvSchema(): SchemaPort {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return {
    validate: async (schema, data) => {
      const validate = ajv.compile(schema);
      const valid = validate(data);
      if (valid) return { valid: true };
      return {
        valid: false,
        errors: validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? ["validation failed"],
      };
    },
  };
}

export async function pinContract(
  studio: StudioPersistencePort,
  contract_ref_id: string,
  contract: ContractV2,
): Promise<{ digest: string; semver: string }> {
  const artifact = (await import("./bridge/contract-v2.js")).contractV2ToRuleArtifact(contract);
  const digest = ruleRefDigest(artifact);

  const existing = await studio.getContractRef(contract_ref_id);
  if (existing) {
    if (existing.digest !== digest) {
      throw new Error(
        `Contract ref ${contract_ref_id} already pinned with digest ${existing.digest} (wanted ${digest})`,
      );
    }
    return { digest: existing.digest, semver: existing.semver };
  }

  await studio.insertContractRef({
    contract_ref_id,
    capability_id: contract.id,
    semver: contract.version,
    digest,
    contract,
  });
  return { digest, semver: contract.version };
}

export type HubKernel = ReturnType<typeof createHubKernel>["kernel"];
