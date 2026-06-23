import type { Aggregate } from "../types/aggregate.js";
import type { JournalEntry } from "../types/journal-entry.js";
import type { RuleArtifact } from "../compatibility/rule-v09.js";
import { ENTRY_TYPES, STATE_MUTATING_TYPES } from "./entry-types.js";

export function isStateMutatingEntry(entry: JournalEntry): boolean {
  return entry.outcome === "success" && (STATE_MUTATING_TYPES as Set<string>).has(entry.type);
}

export function shouldSkipForFold(entry: JournalEntry): boolean {
  if (entry.outcome === "denial") return true;
  if (entry.type === ENTRY_TYPES.CHECKPOINT_VOTE) return true;
  if (entry.type === ENTRY_TYPES.EVENT_APPENDED) return true;
  return false;
}

export interface FoldOptions {
  artifact?: RuleArtifact;
}

/**
 * Reconstruct aggregate state by replaying journal per spec §9 (K9).
 */
export function foldJournalToSnapshot(
  entries: JournalEntry[],
  aggregate_id: string,
  options?: FoldOptions,
): Aggregate | null {
  const relevant = entries
    .filter((e) => e.aggregate_id === aggregate_id)
    .filter((e) => !shouldSkipForFold(e))
    .sort((a, b) => a.seq - b.seq);

  let aggregate: Aggregate | null = null;

  for (const entry of relevant) {
    if (!isStateMutatingEntry(entry)) continue;

    if (entry.type === ENTRY_TYPES.AGGREGATE_CREATED) {
      const p = entry.payload;
      aggregate = {
        aggregate_id,
        scope_id: entry.scope_id,
        rule_ref: p.rule_ref as Aggregate["rule_ref"],
        state: (p.initial_state as string) ?? (options?.artifact?.initial_state ?? ""),
        metadata: (p.metadata as Record<string, unknown>) ?? {},
        revision: (p.revision as number) ?? 0,
        status: (p.status as Aggregate["status"]) ?? "active",
        created_at: entry.ts,
        updated_at: entry.ts,
      };
      continue;
    }

    if (!aggregate) continue;

    if (entry.type === ENTRY_TYPES.TRANSITION_APPLIED) {
      const p = entry.payload;
      aggregate = {
        ...aggregate,
        state: p.to as string,
        revision: (p.revision as number) ?? aggregate.revision + 1,
        metadata: p.metadata_patch
          ? { ...aggregate.metadata, ...(p.metadata_patch as Record<string, unknown>) }
          : aggregate.metadata,
        updated_at: entry.ts,
        status: (p.status as Aggregate["status"]) ?? resolveStatus(p.to as string, options?.artifact),
      };
    }
  }

  return aggregate;
}

function resolveStatus(state: string, artifact?: RuleArtifact): Aggregate["status"] {
  if (!artifact) return "active";
  const stateDef = artifact.states.find((s) => s.id === state);
  if (stateDef?.kind === "terminal") return "terminal";
  if (stateDef?.kind === "archived") return "archived";
  if (artifact.terminal_states.includes(state)) return "terminal";
  return "active";
}
