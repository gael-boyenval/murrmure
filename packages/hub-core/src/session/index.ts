import type {
  Run,
  RunLifecycle,
  Session,
  SessionCreatedBy,
  SessionStatus,
} from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId } from "../bridge/ids.js";
import { deriveSessionStatus } from "./status.js";

function stripPrefixed(id: string): string {
  const idx = id.indexOf("_");
  return idx >= 0 ? id.slice(idx + 1) : id;
}

function prefixed(prefix: string, bare: string): string {
  return `${prefix}_${bare}`;
}

export function toSessionDto(row: {
  session_id: string;
  title: string;
  subject?: string;
  status: SessionStatus;
  created_by: SessionCreatedBy;
  spaces_touched: string[];
}): Session {
  return {
    session_id: prefixed("ses", row.session_id) as Session["session_id"],
    title: row.title,
    subject: row.subject,
    status: row.status,
    created_by: row.created_by,
    spaces_touched: row.spaces_touched.map((s) =>
      s.startsWith("spc_") ? (s as Session["spaces_touched"][number]) : addSpaceId(s),
    ),
  };
}

export function toRunDto(row: {
  run_id: string;
  session_id: string;
  space_id?: string;
  flow_id?: string | null;
  flow_digest?: string;
  lifecycle: RunLifecycle;
  exec_context: Record<string, unknown>;
  reference_run_ids: string[];
  started_at: string;
  ended_at?: string;
}): Run {
  return {
    run_id: prefixed("run", row.run_id) as Run["run_id"],
    session_id: prefixed("ses", row.session_id) as Run["session_id"],
    space_id: row.space_id
      ? row.space_id.startsWith("spc_")
        ? (row.space_id as Run["space_id"])
        : addSpaceId(row.space_id)
      : undefined,
    flow_id: row.flow_id ?? null,
    flow_digest: row.flow_digest,
    lifecycle: row.lifecycle,
    exec_context: row.exec_context,
    reference_run_ids: row.reference_run_ids.map(
      (id) => prefixed("run", stripPrefixed(id)) as Run["reference_run_ids"][number],
    ),
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}

export async function refreshSessionStatus(
  studio: StudioPersistencePort,
  session_id: string,
): Promise<SessionStatus> {
  const bare = stripPrefixed(session_id);
  const session = await studio.getSession(bare);
  if (!session) return "active";

  const runs = await studio.listRunsBySession(bare);
  const status = deriveSessionStatus(
    runs.map((r) => r.lifecycle),
    Boolean(session.cancel_requested_at),
  );
  if (status !== session.status) {
    await studio.updateSessionStatus(bare, status);
  }
  return status;
}

export async function getSessionWithStatus(
  studio: StudioPersistencePort,
  session_id: string,
): Promise<Session | null> {
  const bare = stripPrefixed(session_id);
  const row = await studio.getSession(bare);
  if (!row) return null;
  const status = await refreshSessionStatus(studio, bare);
  return toSessionDto({ ...row, status });
}

export async function listSessionsFiltered(
  studio: StudioPersistencePort,
  filter: { status?: SessionStatus; space_id?: string },
): Promise<Session[]> {
  const bareSpace = filter.space_id ? stripPrefixed(filter.space_id) : undefined;
  const rows = await studio.listSessions({ space_id: bareSpace, status: filter.status });
  const out: Session[] = [];
  for (const row of rows) {
    const status = await refreshSessionStatus(studio, row.session_id);
    if (filter.status && status !== filter.status) continue;
    out.push(toSessionDto({ ...row, status }));
  }
  return out;
}
