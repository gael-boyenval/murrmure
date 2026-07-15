import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, expect, beforeEach } from "vitest";
import { RuntimeKernel } from "../../src/command/handler.js";
import { DeferredWaitRegistry } from "../../src/waiters/registry.js";
import { InMemoryPersistence } from "@murrmure/runtime-persistence";
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
import { DENIAL_CODES, HTTP_SEMANTIC, ruleRefDigest } from "@murrmure/runtime-contracts";
import type { RuleArtifact } from "@murrmure/runtime-contracts";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, "../../../../studio-specs/current/fixtures/kernel");
const GOLDEN = JSON.parse(
  readFileSync(join(FIXTURES, "expected/linear-create-transition.json"), "utf-8"),
);

function loadRule(name: string): RuleArtifact {
  return parseFixtureArtifact(JSON.parse(readFileSync(join(FIXTURES, "rules", name), "utf-8")));
}

function makeKernel(artifact: RuleArtifact) {
  resetFixedIds();
  const digest = ruleRefDigest(artifact);
  const artifacts = new Map([[digest, artifact]]);
  const persistence = new InMemoryPersistence();
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

describe("golden JSON: linear create + transition", () => {
  let kernel: ReturnType<typeof makeKernel>["kernel"];
  let persistence: InMemoryPersistence;
  let digest: string;
  let aggregateId: string;

  beforeEach(() => {
    const artifact = loadRule("linear.json");
    const setup = makeKernel(artifact);
    kernel = setup.kernel;
    persistence = setup.persistence;
    digest = setup.digest;
  });

  test("happy path matches expected_journal and aggregate", async () => {
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

    expect(create.outcome).toBe("success");
    aggregateId = create.body.aggregate_id as string;

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

    expect(transition.outcome).toBe("success");

    const journal = await persistence.tailJournal(0);
    for (const expected of GOLDEN.expected_journal) {
      const entry = journal[expected.seq_offset];
      expect(entry?.type).toBe(expected.type);
      expect(entry?.outcome).toBe(expected.outcome);
      if (expected.payload_contains) {
        for (const [k, v] of Object.entries(expected.payload_contains)) {
          expect(entry?.payload[k]).toBe(v);
        }
      }
    }

    const snap = await kernel.getAggregate(aggregateId);
    expect(snap?.state).toBe(GOLDEN.expected_aggregate.state);
    expect(snap?.revision).toBe(GOLDEN.expected_aggregate.revision);
    expect(snap?.status).toBe(GOLDEN.expected_aggregate.status);
    expect(await kernel.verifyFold(aggregateId)).toBe(true);
  });

  test("illegal transition per golden illegal_transition_test", async () => {
    const artifact = loadRule("linear.json");
    const { kernel: k, persistence: p, digest: d } = makeKernel(artifact);
    const create = await k.execute({
      kind: "aggregate.create",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "c1" },
      rule_ref: { rule_ref_id: "linear", digest: d, version: "1.0.0" },
    });
    const aggId = create.body.aggregate_id as string;

    const denied = await k.execute({
      kind: "state.transition",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "c2" },
      aggregate_id: aggId,
      event: "finish",
      expected_revision: 0,
    });

    const t = GOLDEN.illegal_transition_test;
    expect(denied.outcome).toBe(t.expected_outcome);
    expect(denied.http_semantic).toBe(t.expected_http_semantic);
    expect(denied.code).toBe(t.expected_code);

    const journal = await p.tailJournal(0);
    expect(journal.some((e) => e.type === t.expected_journal_type)).toBe(true);
    const snap = await k.getAggregate(aggId);
    expect(snap?.state).toBe("idle");
    expect(snap?.revision).toBe(0);
  });
});

describe("checkpoint pending creation", () => {
  test("transition with checkpoint quorum pauses aggregate (pending, no state change)", async () => {
    const artifact = loadRule("with-checkpoint.json");
    const { kernel: k, persistence: p, digest: d } = makeKernel(artifact);

    const create = await k.execute({
      kind: "aggregate.create",
      provenance: { scope_id: "scp_test", actor_id: "actor_agent", credential_id: "c", command_id: "cp1", actor_kind: "agent" },
      rule_ref: { rule_ref_id: "approval", digest: d, version: "1.0.0" },
      metadata: {},
    });
    const aggId = create.body.aggregate_id as string;

    const submit = await k.execute({
      kind: "state.transition",
      provenance: { scope_id: "scp_test", actor_id: "actor_agent", credential_id: "c", command_id: "cp2", actor_kind: "agent" },
      aggregate_id: aggId,
      event: "submit",
      expected_revision: 0,
    });

    // The kernel retains checkpoint *creation*: a transition whose rule declares a
    // checkpoint quorum pauses the aggregate (CHECKPOINT_PENDING, 202 Accepted) with
    // no state change. The hub no longer bridges a gate.resolve into a kernel
    // checkpoint.resolve command — advancing the checkpoint is owned by the
    // orchestration gate service on the gates table, so the kernel records only the
    // pending checkpoint and never a checkpoint.resolved event here.
    expect(submit.http_semantic).toBe(HTTP_SEMANTIC.ACCEPTED);
    expect(submit.code).toBe(DENIAL_CODES.CHECKPOINT_PENDING);

    const snapPending = await k.getAggregate(aggId);
    expect(snapPending?.state).toBe("draft");
    expect(snapPending?.revision).toBe(0);

    const journal = await p.tailJournal(0);
    expect(journal.some((e) => e.type === "checkpoint.created")).toBe(true);
    expect(journal.some((e) => e.type === "checkpoint.resolved")).toBe(false);
  });
});

describe("K5 policy denial appends journal", () => {
  test("policy.denied entry", async () => {
    const artifact = loadRule("linear.json");
    const digest = ruleRefDigest(artifact);
    const persistence = new InMemoryPersistence();
    const waitRegistry = new DeferredWaitRegistry();
    const kernel = new RuntimeKernel({
      persistence,
      policy: (await import("../stubs/index.js")).denyPolicy(),
      rules: inMemoryRules(new Map([[digest, artifact]])),
      condition: permissiveCondition(),
      schema: strictSchema(),
      convergence: noOpConvergence(),
      notify: compositeNotify(waitRegistry),
      action: recordingAction(),
      clock: fixedClockPort(),
      ids: fixedIdPort(),
      waitRegistry,
    });

    const result = await kernel.execute({
      kind: "aggregate.create",
      provenance: { scope_id: "s", actor_id: "a", credential_id: "c", command_id: "deny1" },
      rule_ref: { rule_ref_id: "linear", digest, version: "1.0.0" },
    });

    expect(result.outcome).toBe("denial");
    expect(result.code).toBe(DENIAL_CODES.POLICY_DENIED);
    const journal = await persistence.tailJournal(0);
    expect(journal[0]?.type).toBe("policy.denied");
  });
});

describe("reaction dedup golden", () => {
  test("same event dedup suppresses second invoke", async () => {
    const artifact = loadRule("linear.json");
    const reactionFixture = JSON.parse(readFileSync(join(FIXTURES, "reactions/on-transition-applied.json"), "utf-8"));
    const { kernel: k, persistence: p, digest: d, action } = makeKernel(artifact);

    await k.execute({
      kind: "reaction.register",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "rx1" },
      spec: {
        reaction_id: reactionFixture.reaction_id,
        scope_id: reactionFixture.scope_id,
        filter: reactionFixture.filter,
        action: reactionFixture.action,
        dedup: reactionFixture.dedup,
        partition: reactionFixture.partition,
      },
    });

    const create = await k.execute({
      kind: "aggregate.create",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "rx2" },
      rule_ref: { rule_ref_id: "linear", digest: d, version: "1.0.0" },
    });
    const aggId = create.body.aggregate_id as string;

    await k.execute({
      kind: "state.transition",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "rx3" },
      aggregate_id: aggId,
      event: "start",
      expected_revision: 0,
    });

    expect(action.invokes.length).toBe(1);

    await k.execute({
      kind: "reaction.replay",
      provenance: { scope_id: "scp_test", actor_id: "a", credential_id: "c", command_id: "rx4" },
      reaction_id: reactionFixture.reaction_id,
      source_entry_id: (await p.tailJournal(0)).find((e) => e.type === "transition.applied")!.entry_id,
      bypass_dedup: true,
      reason: "test",
    });

    expect(action.invokes.length).toBe(2);
  });
});

describe("K16 schema v0.9 compatibility", () => {
  test("executes v0.9 artifact", async () => {
    const artifact = loadRule("schema-v0.9.json");
    const { kernel: k, digest: d } = makeKernel(artifact);

    const create = await k.execute({
      kind: "aggregate.create",
      provenance: { scope_id: "scp", actor_id: "a", credential_id: "c", command_id: "v09-1" },
      rule_ref: { rule_ref_id: "legacy", digest: d, version: "0.9.0" },
    });

    expect(create.outcome).toBe("success");
    const aggId = create.body.aggregate_id as string;
    const snap = await k.getAggregate(aggId);
    expect(snap?.state).toBe("idle");
  });
});
