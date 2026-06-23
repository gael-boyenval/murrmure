import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersistencePort, RuleArtifact } from "@murrmure/runtime-contracts";
import { ruleRefDigest } from "@murrmure/runtime-contracts";
import { RuntimeKernel } from "../../src/command/handler.js";
import { DeferredWaitRegistry } from "../../src/waiters/registry.js";
import {
  allowAllPolicy,
  compositeNotify,
  fixedClockPort,
  fixedIdPort,
  inMemoryRules,
  parseFixtureArtifact,
  permissiveCondition,
  recordingAction,
  resetFixedIds,
  strictSchema,
  noOpConvergence,
} from "../stubs/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(__dir, "../../../../studio-specs/current/fixtures/kernel");

export function loadRule(name: string): RuleArtifact {
  return parseFixtureArtifact(JSON.parse(readFileSync(join(FIXTURES, "rules", name), "utf-8")));
}

export function makeKernel(artifact: RuleArtifact, persistence: PersistencePort) {
  resetFixedIds();
  const digest = ruleRefDigest(artifact);
  const artifacts = new Map([[digest, artifact]]);
  const waitRegistry = new DeferredWaitRegistry();
  const action = recordingAction();

  const kernel = new RuntimeKernel({
    persistence,
    policy: allowAllPolicy(),
    rules: inMemoryRules(artifacts),
    condition: permissiveCondition(),
    schema: strictSchema(),
    convergence: noOpConvergence(),
    notify: compositeNotify(waitRegistry),
    action,
    clock: fixedClockPort(),
    ids: fixedIdPort(),
    waitRegistry,
  });

  return { kernel, persistence, artifact, digest, action };
}

export async function runLinearHappyPath(persistence: PersistencePort) {
  const artifact = loadRule("linear.json");
  const { kernel, digest } = makeKernel(artifact, persistence);

  const create = await kernel.execute({
    kind: "aggregate.create",
    provenance: {
      scope_id: "scp_test",
      actor_id: "actor_001",
      credential_id: "cred_001",
      command_id: "cmd-create",
    },
    rule_ref: { rule_ref_id: "linear-workflow", digest, version: "1.0.0" },
    metadata: { label: "test" },
  });

  const aggregateId = create.body.aggregate_id as string;

  const transition = await kernel.execute({
    kind: "state.transition",
    provenance: {
      scope_id: "scp_test",
      actor_id: "actor_001",
      credential_id: "cred_001",
      command_id: "cmd-start",
    },
    aggregate_id: aggregateId,
    event: "start",
    expected_revision: 0,
  });

  const journal = await persistence.tailJournal(0);
  const snap = await kernel.getAggregate(aggregateId);

  return { create, transition, journal, snap, aggregateId };
}

export function journalFingerprint(journal: Awaited<ReturnType<PersistencePort["tailJournal"]>>): string {
  return JSON.stringify(
    journal.map((e) => ({
      type: e.type,
      outcome: e.outcome,
      payload: e.payload,
      seq: e.seq,
    })),
  );
}
