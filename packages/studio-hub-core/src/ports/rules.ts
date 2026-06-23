import type { RuleArtifact, RuleRef, RulesPort } from "@runtime/contracts";
import { ruleRefDigest } from "@runtime/contracts";
import type { StudioPersistencePort } from "@studio/hub-persistence";
import { contractV2ToRuleArtifact } from "../bridge/contract-v2.js";

export function createStudioRulesPort(studio: StudioPersistencePort): RulesPort {
  const cache = new Map<string, RuleArtifact>();

  return {
    load: async (ref: RuleRef): Promise<RuleArtifact> => {
      const cached = cache.get(ref.digest);
      if (cached) return cached;

      const row = await studio.getContractRef(ref.rule_ref_id);
      if (!row) throw new Error(`Contract ref not found: ${ref.rule_ref_id}`);

      const artifact = contractV2ToRuleArtifact(row.contract);
      cache.set(ref.digest, artifact);
      return artifact;
    },

    loadByKey: async (_scope_id: string, key: string): Promise<RuleRef> => {
      const row = await studio.getContractRef(key);
      if (!row) throw new Error(`Contract ref not found: ${key}`);
      const artifact = contractV2ToRuleArtifact(row.contract);
      const digest = ruleRefDigest(artifact);
      cache.set(digest, artifact);
      return { rule_ref_id: key, digest, version: row.semver };
    },
  };
}
