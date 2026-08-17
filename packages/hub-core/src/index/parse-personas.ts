import { PersonasFileSchema, type PersonasFile } from "@murrmure/contracts";
import type { ParseResult } from "./parse-result.js";

export function parsePersonasFile(raw: unknown): ParseResult<PersonasFile> {
  const parsed = PersonasFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_PERSONAS",
      message: "personas.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
