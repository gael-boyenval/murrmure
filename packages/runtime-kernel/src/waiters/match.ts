import type { JournalEntry, WaitCondition } from "@murrmure/runtime-contracts";

export interface CompoundProgress {
  satisfied: Set<string>;
}

export function matchesWaitCondition(
  condition: WaitCondition,
  entry: JournalEntry,
  progress?: CompoundProgress,
): { matched: boolean; progress?: CompoundProgress } {
  switch (condition.type) {
    case "state":
      if (entry.type === "transition.applied" && entry.outcome === "success") {
        return { matched: entry.payload.to === condition.state };
      }
      if (entry.type === "aggregate.created" && entry.outcome === "success") {
        return { matched: entry.payload.initial_state === condition.state };
      }
      return { matched: false };

    case "entry": {
      if (entry.type !== condition.entry_type || entry.outcome !== "success") {
        return { matched: false };
      }
      if (!condition.match) return { matched: true };
      return { matched: payloadMatches(entry.payload, condition.match) };
    }

    case "checkpoint": {
      if (condition.checkpoint_id && entry.payload.checkpoint_id !== condition.checkpoint_id) {
        return { matched: false };
      }
      if (entry.type === "checkpoint.resolved" && condition.resolution === "approved") {
        return { matched: true };
      }
      if (entry.type === "checkpoint.rejected" && condition.resolution === "rejected") {
        return { matched: true };
      }
      return { matched: false };
    }

    case "artifact":
      return { matched: false };

    case "compound": {
      if (condition.all_of) {
        const prog = progress ?? { satisfied: new Set<string>() };
        for (let i = 0; i < condition.all_of.length; i++) {
          const key = `all:${i}`;
          if (prog.satisfied.has(key)) continue;
          const subResult = matchesWaitCondition(condition.all_of[i]!, entry, prog);
          if (subResult.matched) prog.satisfied.add(key);
        }
        const allMatched = condition.all_of.every((_, i) => prog.satisfied.has(`all:${i}`));
        return { matched: allMatched, progress: prog };
      }
      if (condition.any_of) {
        for (const sub of condition.any_of) {
          if (matchesWaitCondition(sub, entry).matched) return { matched: true };
        }
        return { matched: false };
      }
      return { matched: false };
    }
  }
}

function payloadMatches(payload: Record<string, unknown>, match: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(match)) {
    if (payload[key] !== value) return false;
  }
  return true;
}
