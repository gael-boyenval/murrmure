import type {
  CommandResult,
  JournalEntryDraft,
  KernelCommand,
  Provenance,
} from "@murrmure/runtime-contracts";
import { ENTRY_TYPES } from "@murrmure/runtime-contracts";

export function provenanceFields(p: Provenance) {
  return {
    scope_id: p.scope_id,
    actor_id: p.actor_id,
    credential_id: p.credential_id,
    command_id: p.command_id,
    actor_kind: p.actor_kind,
  };
}

export function buildEntry(
  p: Provenance,
  entry_id: string,
  ts: string,
  type: string,
  outcome: "success" | "denial",
  payload: Record<string, unknown>,
  opts?: {
    aggregate_id?: string;
    kind?: JournalEntryDraft["kind"];
    denial?: JournalEntryDraft["denial"];
  },
): JournalEntryDraft {
  return {
    entry_id,
    kind: opts?.kind ?? "command",
    outcome,
    scope_id: p.scope_id,
    aggregate_id: opts?.aggregate_id,
    actor_id: p.actor_id,
    credential_id: p.credential_id,
    command_id: p.command_id,
    ts,
    type,
    payload,
    denial: opts?.denial,
    correlation: p.command_id ? { command_id: p.command_id } : undefined,
  };
}

export function buildDenialEntry(
  p: Provenance,
  entry_id: string,
  ts: string,
  type: string,
  code: string,
  message: string,
  retryable: boolean,
  context?: Record<string, unknown>,
  aggregate_id?: string,
): JournalEntryDraft {
  return buildEntry(p, entry_id, ts, type, "denial", {}, {
    aggregate_id,
    denial: { code, message, retryable, context },
  });
}

export function resultFromEntry(
  entry: { entry_id: string; seq: number },
  code: string,
  body: Record<string, unknown>,
  http_semantic: CommandResult["http_semantic"],
  outcome: CommandResult["outcome"],
): CommandResult {
  return { outcome, http_semantic, code, body, journal_entry_id: entry.entry_id, seq: entry.seq };
}

export { ENTRY_TYPES };
