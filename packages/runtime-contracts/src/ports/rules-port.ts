import { RuleArtifactSchema } from "../schemas/core.js";
import type { RuleRef } from "../types/rule-ref.js";
import type { RuleArtifact } from "../compatibility/rule-v09.js";
import { normalizeRuleArtifact } from "../compatibility/rule-v09.js";

export interface RulesPort {
  load(ref: RuleRef): Promise<RuleArtifact>;
  loadByKey(scope_id: string, rule_set_key: string): Promise<RuleRef>;
}

export function parseRuleArtifact(raw: unknown): RuleArtifact {
  const parsed = RuleArtifactSchema.parse(raw);
  return normalizeRuleArtifact(parsed);
}
