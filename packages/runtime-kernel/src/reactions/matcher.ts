import type { JournalEntry, ReactionSpec } from "@runtime/contracts";

export function matchesReaction(reaction: ReactionSpec, entry: JournalEntry): boolean {
  if (!reaction.enabled) return false;
  if (entry.seq < reaction.registered_at_seq) return false;
  const { filter } = reaction;
  if (filter.source_scope_id && entry.scope_id !== filter.source_scope_id) return false;
  if (filter.aggregate_id && entry.aggregate_id !== filter.aggregate_id) return false;
  if (filter.entry_types && !filter.entry_types.includes(entry.type)) return false;
  return true;
}

export function extractDedupKey(reaction: ReactionSpec, entry: JournalEntry): string {
  const { dedup } = reaction;
  if (dedup.key_extractor === "json_path" && dedup.key_path) {
    const path = dedup.key_path.replace(/^\$\.?/, "").split(".");
    let value: unknown = entry;
    for (const part of path) {
      if (value && typeof value === "object" && part in (value as object)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        value = undefined;
        break;
      }
    }
    if (value !== undefined) return String(value);
  }
  if (entry.payload.dedup_key) return String(entry.payload.dedup_key);
  return entry.entry_id;
}

export function partitionKey(reaction: ReactionSpec, entry: JournalEntry): string {
  switch (reaction.partition.key) {
    case "scope":
      return entry.scope_id;
    case "aggregate":
      return entry.aggregate_id ?? "_";
    case "scope:aggregate":
      return `${entry.scope_id}:${entry.aggregate_id ?? "_"}`;
    case "reaction":
      return reaction.reaction_id;
  }
}

export function dedupFingerprint(reaction: ReactionSpec, entry: JournalEntry): string {
  const key = extractDedupKey(reaction, entry);
  const partition = partitionKey(reaction, entry);
  const raw = `${reaction.reaction_id}|${partition}|${key}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(16, "0");
}
