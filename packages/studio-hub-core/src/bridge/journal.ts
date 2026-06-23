import type { JournalEntry } from "@runtime/contracts";
import type { HubEvent } from "@studio/contracts";
import { addEventId, addInstanceId, addSpaceId, addTokenId } from "./ids.js";

export function journalEntryToHubEvent(
  entry: JournalEntry,
  space_seq: number,
  instance_seq?: number,
): HubEvent {
  return {
    seq: entry.seq,
    space_seq,
    instance_seq,
    event_id: addEventId(entry.entry_id),
    type: entry.type,
    outcome: entry.outcome,
    space_id: addSpaceId(entry.scope_id),
    instance_id: entry.aggregate_id ? addInstanceId(entry.aggregate_id) : undefined,
    actor_id: entry.actor_id,
    token_id: addTokenId(entry.credential_id),
    ts: entry.ts,
    payload: entry.payload ?? {},
    blob_refs: [],
    denial:
      entry.outcome === "denial"
        ? { code: entry.payload?.code as string ?? "denial", message: entry.payload?.message as string ?? "" }
        : undefined,
  };
}
