import type {
  ActionPort,
  ActionSpec,
  ConditionPort,
  ConvergencePort,
  IdPort,
  InProcessWaitRegistry,
  JournalEntry,
  NotifyPort,
  PolicyPort,
  RuleArtifact,
  RuleRef,
  RulesPort,
  SchemaPort,
  WaitResolution,
} from "@murrmure/runtime-contracts";
import { parseRuleArtifact } from "@murrmure/runtime-contracts";
import Ajv from "ajv";

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

export function fixedClockPort() {
  return { nowIso: () => FIXED_TS };
}

export function resetFixedIds() {
  fixedSeq = 0;
}

export function allowAllPolicy(): PolicyPort {
  return { evaluate: async () => ({ allowed: true }) };
}

export function denyPolicy(): PolicyPort {
  return {
    evaluate: async () => ({
      allowed: false,
      denial: { code: "policy_denied", message: "Denied", retryable: false },
    }),
  };
}

export function permissiveCondition(): ConditionPort {
  return {
    evaluate: async (c) => c === null,
    matchActor: async (_id, patterns) => patterns.includes("*") || patterns.some((p) => p.endsWith(":*")),
    matchAssignee: async (actor_id, assignees, actor_kind) => {
      for (const p of assignees) {
        if (p === "*") return true;
        if (p === "human:*" && actor_kind === "human") return true;
        if (p === "agent:*" && actor_kind === "agent") return true;
      }
      return false;
    },
  };
}

export function noOpSchema(): SchemaPort {
  return { validate: async () => ({ valid: true }) };
}

export function strictSchema(): SchemaPort {
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

export function noOpConvergence(): ConvergencePort {
  return { evaluate: async () => ({ emit: [] }) };
}

export function inMemoryRules(artifacts: Map<string, RuleArtifact>): RulesPort {
  return {
    load: async (ref: RuleRef) => {
      const art = artifacts.get(ref.digest) ?? artifacts.get(ref.rule_ref_id);
      if (!art) throw new Error(`Artifact not found: ${ref.digest}`);
      return art;
    },
    loadByKey: async (_s, key) => ({ rule_ref_id: key, digest: key, version: "1.0.0" }),
  };
}

export function parseFixtureArtifact(raw: unknown): RuleArtifact {
  return parseRuleArtifact(raw);
}

export function recordingAction(): ActionPort & { invokes: Array<{ type: string; entry_id: string }> } {
  const invokes: Array<{ type: string; entry_id: string }> = [];
  return {
    invoke: async (action: ActionSpec, ctx: { entry: JournalEntry }) => {
      invokes.push({ type: action.type, entry_id: ctx.entry.entry_id });
      return { outcome: "success" };
    },
    invokes,
  };
}

export function compositeNotify(registry: InProcessWaitRegistry): NotifyPort {
  return {
    resolveWait: async (wait_id: string, resolution: WaitResolution) => {
      registry.resolve(wait_id, resolution);
    },
  };
}
