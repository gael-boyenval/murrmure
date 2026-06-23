import type { RuleArtifactParsed } from "../schemas/core.js";
import type { AggregateStatus } from "../types/primitives.js";

export interface NormalizedRuleArtifact {
  schema_version: "1.0" | "0.9";
  id: string;
  version: string;
  initial_state: string;
  terminal_states: string[];
  metadata_schema: Record<string, unknown>;
  states: Array<{ id: string; kind: "active" | "terminal" | "archived" }>;
  transitions: RuleArtifactParsed["transitions"];
  events?: RuleArtifactParsed["events"];
  convergence?: RuleArtifactParsed["convergence"];
  checkpoints?: RuleArtifactParsed["checkpoints"];
}

/** Normalize RuleArtifact v0.9 → kernel-internal shape (K16). */
export function normalizeRuleArtifact(raw: RuleArtifactParsed): NormalizedRuleArtifact {
  const terminalSet = new Set(raw.terminal_states);
  const states = raw.states.map((s) => {
    let kind: AggregateStatus = "active";
    if (s.kind) {
      kind = s.kind;
    } else if (terminalSet.has(s.id)) {
      kind = "terminal";
    }
    return { id: s.id, kind };
  });

  return {
    schema_version: raw.schema_version,
    id: raw.id,
    version: raw.version,
    initial_state: raw.initial_state,
    terminal_states: raw.terminal_states,
    metadata_schema: raw.metadata_schema ?? {},
    states,
    transitions: raw.transitions,
    events: raw.events,
    convergence: raw.convergence,
    checkpoints: raw.checkpoints,
  };
}

export type RuleArtifact = NormalizedRuleArtifact;
