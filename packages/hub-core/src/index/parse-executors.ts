import { ExecutorsFileSchema, type ExecutorsFile } from "@murrmure/contracts";
import type { ParseResult } from "./parse-actions.js";

export function parseExecutorsFile(raw: unknown): ParseResult<ExecutorsFile> {
  const parsed = ExecutorsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_EXECUTORS",
      message: "executors.yaml failed validation",
      details: parsed.error,
    };
  }
  return { ok: true, value: parsed.data };
}
