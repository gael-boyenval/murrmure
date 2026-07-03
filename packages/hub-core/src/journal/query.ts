import type { JournalIndexRow, StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId } from "../bridge/ids.js";

export interface JournalQueryFilter {
  subject?: string;
  type?: string;
  session_id?: string;
  space_id?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface JournalQueryEntry {
  id: string;
  type: string;
  time: string;
  subject?: string;
  space_id: string;
  session_id?: string;
  run_id?: string;
  actor_id?: string;
  seq: number;
  data: Record<string, unknown>;
}

function rowToEntry(row: JournalIndexRow): JournalQueryEntry {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  return {
    id: row.entry_id,
    type: row.type,
    time: row.time,
    subject: row.subject,
    space_id: addSpaceId(row.space_id),
    session_id: row.session_id ? `ses_${row.session_id}` : undefined,
    run_id: row.run_id ? `run_${row.run_id}` : undefined,
    actor_id: row.actor_id,
    seq: row.seq,
    data: payload,
  };
}

export async function queryJournal(
  studio: StudioPersistencePort,
  filter: JournalQueryFilter,
): Promise<JournalQueryEntry[]> {
  const sessionBare = filter.session_id?.startsWith("ses_")
    ? filter.session_id.slice(4)
    : filter.session_id;
  const spaceBare = filter.space_id?.startsWith("spc_") ? filter.space_id.slice(4) : filter.space_id;

  const rows = await studio.queryJournalIndex({
    subject: filter.subject,
    type: filter.type,
    session_id: sessionBare,
    space_id: spaceBare,
    since: filter.since,
    until: filter.until,
    limit: filter.limit ?? 100,
  });

  return rows.map(rowToEntry);
}
