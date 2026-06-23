import type { HttpSemantic, Outcome } from "./primitives.js";

export interface CommandResult {
  outcome: Outcome;
  http_semantic: HttpSemantic;
  code: string;
  body: Record<string, unknown>;
  journal_entry_id?: string;
  seq?: number;
}

export function successResult(
  code: string,
  body: Record<string, unknown>,
  http_semantic: HttpSemantic = 200,
  journal_entry_id?: string,
  seq?: number,
): CommandResult {
  return { outcome: "success", http_semantic, code, body, journal_entry_id, seq };
}

export function denialResult(
  code: string,
  body: Record<string, unknown>,
  http_semantic: HttpSemantic,
  journal_entry_id?: string,
  seq?: number,
): CommandResult {
  return { outcome: "denial", http_semantic, code, body, journal_entry_id, seq };
}
