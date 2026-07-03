import { ActionsFileSchema, type ActionsFile } from "@murrmure/contracts";
import type { ZodError } from "zod";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: ZodError };

export function parseActionsFile(raw: unknown): ParseResult<ActionsFile> {
  const parsed = ActionsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_ACTIONS",
      message: "actions.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
