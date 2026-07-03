import type {
  ReactionActionPort,
  ConditionPort,
  ConvergencePort,
  IdPort,
  InProcessWaitRegistry,
  NotifyPort,
  PolicyPort,
  RuleArtifact,
  RuleRef,
  RulesPort,
  SchemaPort,
  WaitResolution,
} from "@murrmure/runtime-contracts";

export function allowAllPolicy(): PolicyPort {
  return { evaluate: async () => ({ allowed: true }) };
}

export function permissiveCondition(): ConditionPort {
  return {
    evaluate: async (c) => c === null,
    matchActor: async (_id, patterns) => patterns.includes("*"),
    matchAssignee: async () => true,
  };
}

export function noOpSchema(): SchemaPort {
  return { validate: async () => ({ valid: true }) };
}

export function noOpConvergence(): ConvergencePort {
  return { evaluate: async () => ({}) };
}

export function fixedIdPort(): IdPort {
  let n = 0;
  return { ulid: () => `01JDAEMON${String(++n).padStart(14, "0")}` };
}

export function fixedClockPort() {
  return { nowIso: () => new Date().toISOString() };
}

export function inMemoryRules(artifacts: Map<string, RuleArtifact>): RulesPort {
  const byDigest = artifacts;
  const first = () => [...artifacts.values()][0]!;
  return {
    load: async (ref) => {
      const art = byDigest.get(ref.digest);
      if (!art) throw new Error(`Rule not found: ${ref.digest}`);
      return art;
    },
    loadByKey: async (_scope_id, _rule_set_key) => {
      const art = first();
      return { rule_ref_id: art.id, digest: art.id, version: art.version };
    },
  };
}

export function recordingAction(): ReactionActionPort & { invokes: unknown[] } {
  const invokes: unknown[] = [];
  return {
    invokes,
    invoke: async (action, ctx) => {
      invokes.push({ action, ctx });
      return { outcome: "success" };
    },
  };
}

export function compositeNotify(registry: InProcessWaitRegistry): NotifyPort {
  return {
    resolveWait: async (wait_id, resolution: WaitResolution) => {
      registry.resolve(wait_id, resolution);
    },
  };
}
